import { SlashCommandBuilder } from "@discordjs/builders";

const initCommand = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Request to join the group!");

export default initCommand.toJSON();
