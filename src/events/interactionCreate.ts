import {
  Events,
  CommandInteraction,
  AutocompleteInteraction,
  GuildMember,
  ButtonInteraction,
  EmbedBuilder,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
} from "discord.js";
import { prisma } from "../database/prisma.js";
import { contractService } from "../services/contractService.js";
import { claimOffer } from "../services/offerSessionStore.js";
import {
  handleSetupButton,
  handleSetupSelect,
  handleSetupChannelSelect,
} from "../commands/setup/index.js";
import type { ExtendedClient, TeamRole } from "../types/index.js";

const event = {
  name: Events.InteractionCreate,
  async execute(
    interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction | AutocompleteInteraction
  ) {
    // ─── SETUP PANEL BUTTONS ───
    if (interaction.isButton() && interaction.customId.startsWith("sp_")) {
      return handleSetupButton(interaction);
    }

    // ─── SETUP PANEL STRING SELECT MENUS ───
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("sp_")) {
      return handleSetupSelect(interaction);
    }

    // ─── SETUP PANEL CHANNEL SELECT MENUS ───
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("sp_")) {
      return handleSetupChannelSelect(interaction);
    }

    // ─── OFFER BUTTONS ───
    if (interaction.isButton()) {
      return handleOfferButton(interaction);
    }

    // ─── AUTOCOMPLETE ───
    if (interaction.isAutocomplete()) {
      const focusedName = interaction.options.getFocused().toString().toLowerCase();
      const commandName = interaction.commandName;

      try {
        if (["team", "club", "match"].includes(commandName)) {
          const teams = await prisma.team.findMany({
            where: { name: { contains: focusedName, mode: "insensitive" } },
            take: 10,
            orderBy: { name: "asc" },
          });
          await interaction.respond(
            teams.map(t => ({ name: `${t.emoji || "🏟️"} ${t.name}`, value: t.name }))
          );
          return;
        }
      } catch {
        await interaction.respond([]);
      }
      return;
    }

    // ─── SLASH COMMANDS ONLY ───
    if (!interaction.isChatInputCommand()) return;

    const client = interaction.client as ExtendedClient;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        content: "❌ Command not found.",
        ephemeral: true,
      });
      return;
    }

    // Cooldown check using a WeakMap attached to client
    const cooldownKey = `${interaction.user.id}-${command.data.name}`;
    const cooldownAmount = (command.cooldown ?? 3) * 1000;
    const now = Date.now();

    // Use a property on the client for cooldowns
    if (!(client as any).cooldowns) {
      (client as any).cooldowns = new Map();
    }
    const cooldowns = (client as any).cooldowns as Map<string, number>;

    if (cooldowns.has(cooldownKey)) {
      const expiration = cooldowns.get(cooldownKey)!;
      if (now < expiration) {
        const timeLeft = ((expiration - now) / 1000).toFixed(1);
        await interaction.reply({
          content: `⏳ Please wait ${timeLeft}s before using \`/${command.data.name}\` again.`,
          ephemeral: true,
        });
        return;
      }
    }

    // Permission check if specified
    if (command.permissions && command.permissions.length > 0) {
      const member = interaction.member as GuildMember | null;
      if (member) {
        const hasPerms = command.permissions.every((perm) =>
          member.permissions.has(perm)
        );
        if (!hasPerms) {
          await interaction.reply({
            content: "❌ You don't have permission to use this command.",
            ephemeral: true,
          });
          return;
        }
      }
    }

    // Execute the command
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Error] Command /${command.data.name}:`, error);

      const reply = {
        content: "❌ An error occurred while executing this command.",
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }

    // Set cooldown
    cooldowns.set(cooldownKey, now + cooldownAmount);
  },
};

// ─── OFFER BUTTON HANDLER ──────────────────────────────────────────────────

async function handleOfferButton(interaction: ButtonInteraction) {
  const [action, offerId] = interaction.customId.split(":");
  if (!offerId) {
    await interaction.reply({ content: "❌ Invalid interaction.", ephemeral: true });
    return;
  }

  // ─── ACCEPT OFFER ───
  if (action === "offer_accept") {
    await interaction.deferReply({ ephemeral: true });

    const offer = claimOffer(offerId);
    if (!offer) {
      await interaction.editReply({
        content: "❌ This offer has expired or already been processed.",
      });
      return;
    }

    if (interaction.user.id !== offer.targetDiscordId) {
      await interaction.editReply({
        content: "❌ This offer was sent to someone else.",
      });
      return;
    }

    try {
      const { player, contract, team } = await contractService.offerContract(
        offer.contractData as Parameters<typeof contractService.offerContract>[0]
      );

      // Fetch guild from client since interaction is from DM (no guild context)
      const guild = interaction.guild ||
        (interaction.client.guilds.cache.get(offer.guildId) ||
         await interaction.client.guilds.fetch(offer.guildId).catch(() => null));

      let nickResult = "";
      if (offer.contractData.nickname && guild) {
        try {
          const member = await guild.members.fetch(offer.targetDiscordId);
          await member.setNickname(offer.contractData.nickname);
          nickResult = `\n📛 Nickname set to **${offer.contractData.nickname}**`;
        } catch {
          nickResult = "\n⚠️ Could not set nickname (check perms)";
        }
      }

      if (!offer.contractData.nickname && guild) {
        try {
          const member = await guild.members.fetch(offer.targetDiscordId);
          const shortName = team.shortName || team.name.slice(0, 4).toUpperCase();
          const autoNick = `[${shortName}] ${offer.contractData.username}`.slice(0, 31);
          await member.setNickname(autoNick);
          nickResult = `\n📛 Auto-nicknamed → **${autoNick}**`;
          // Persist to player record so /account shows it
          await prisma.player.update({
            where: { discordId: offer.targetDiscordId },
            data: { nickname: autoNick },
          });
        } catch {
          // Non-critical
        }
      }

      let roleResult = "";
      if (guild && team.roleId) {
        try {
          const member = await guild.members.fetch(offer.targetDiscordId);
          const tRole = await guild.roles.fetch(team.roleId).catch(() => null);
          if (tRole) {
            await member.roles.add(tRole, "LFC Contract Accepted");
            roleResult = `\n🎭 Role **${tRole.name}** assigned`;
          }
        } catch {
          // Non-critical
        }
      }

      if (guild) {
        try {
          const member = await guild.members.fetch(offer.targetDiscordId);
          const faRole = guild.roles.cache.find((r) => r.name === "Free Agent");
          if (faRole) {
            await member.roles.remove(faRole, "Contract Accepted");
          }
        } catch {
          // Non-critical
        }
      }

      const posEmoji: Record<string, string> = {
        Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "⚡", Forward: "⚽",
      };
      const embed = new EmbedBuilder()
        .setTitle(`${posEmoji[offer.contractData.position] || "📝"} Offer Accepted!`)
        .setColor("#00AA00")
        .setDescription(`**${offer.contractData.username}** is now a **${team.name}** player! 🎉`)
        .addFields(
          { name: "👤 Player", value: `<@${offer.targetDiscordId}>`, inline: true },
          { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
          { name: "⚽ Position", value: offer.contractData.position, inline: true },
          { name: "🆔 LFC ID", value: `\`${player.lfcId}\``, inline: true },
        )
        .setFooter({ text: `Contract: ${contract.id.slice(0, 8)}${roleResult}${nickResult}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      try {
        const offerer = await interaction.client.users.fetch(offer.offeredByDiscordId);
        await offerer.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Offer Accepted!")
              .setColor("#00AA00")
              .setDescription(`<@${offer.targetDiscordId}> has accepted the offer to **${team.name}**!`)
              .addFields(
                { name: "👤 Player", value: `<@${offer.targetDiscordId}>`, inline: true },
                { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
              )
              .setTimestamp(),
          ],
        });
      } catch {}

      if (guild) {
        try {
          const config = await prisma.guildConfig.findUnique({
            where: { guildId: guild.id },
          });
          if (config?.newsChannelId) {
            const channel = guild.channels.cache.get(config.newsChannelId);
            if (channel && channel.isTextBased()) {
              const transferEmbed = new EmbedBuilder()
                .setTitle("🔄 Transfer Completed")
                .setColor("#00AA00")
                .setDescription(`**${offer.contractData.username}** has joined **${team.name}**!`)
                .addFields(
                  { name: "👤 Player", value: `<@${offer.targetDiscordId}>`, inline: true },
                  { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
                  { name: "⚽ Position", value: offer.contractData.position, inline: true },
                )
                .setFooter({ text: "Legacy Football Championship • Transfers" })
                .setTimestamp();
              await channel.send({ embeds: [transferEmbed] });
            }
          }
        } catch {}
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await interaction.editReply({ content: `❌ Failed to process offer: ${msg}` });
    }
    return;
  }

  // ─── DECLINE OFFER ───
  if (action === "offer_decline") {
    await interaction.deferReply({ ephemeral: true });

    const offer = claimOffer(offerId);
    if (!offer) {
      await interaction.editReply({
        content: "❌ This offer has expired or already been processed.",
      });
      return;
    }

    if (interaction.user.id !== offer.targetDiscordId) {
      await interaction.editReply({
        content: "❌ This offer wasn't sent to you.",
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Offer Declined")
          .setColor("#FF4444")
          .setDescription(`You have declined the offer from **${offer.teamName}**.`)
          .setTimestamp(),
      ],
    });

    try {
      const offerer = await interaction.client.users.fetch(offer.offeredByDiscordId);
      await offerer.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Offer Declined")
            .setColor("#FF4444")
            .setDescription(
              `<@${offer.targetDiscordId}> has declined the offer to **${offer.teamName}**.`
            )
            .setTimestamp(),
        ],
      });
    } catch {}
    return;
  }
}

export default event;