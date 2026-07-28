import { Events, CommandInteraction, GuildMember } from "discord.js";
import type { ExtendedClient } from "../types/index.js";

const event = {
  name: Events.InteractionCreate,
  async execute(interaction: CommandInteraction) {
    // Handle slash commands only
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

    // Cooldown check
    const cooldownKey = `${interaction.user.id}-${command.data.name}`;
    const cooldownAmount = (command.cooldown ?? 3) * 1000;
    const now = Date.now();

    // Simple in-memory cooldown
    if (!("cooldowns" in client)) {
      (client as Record<string, unknown>).cooldowns = new Map();
    }
    const cooldowns = (client as Record<string, unknown>).cooldowns as Map<string, number>;

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

export default event;