import { SlashCommandBuilder } from "@discordjs/builders";

const settingsCommand = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("View current group settings");

export default settingsCommand.toJSON();
