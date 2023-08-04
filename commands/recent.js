import { SlashCommandBuilder } from "@discordjs/builders";

const recentCommand = new SlashCommandBuilder()
  .setName("recent")
  .setDescription("View your transactions for the last 7 days");

export default recentCommand.toJSON();
