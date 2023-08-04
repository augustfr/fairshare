import { SlashCommandBuilder } from "@discordjs/builders";

const exchangesCommand = new SlashCommandBuilder()
  .setName("exchanges")
  .setDescription("View current exchanges");

export default exchangesCommand.toJSON();
