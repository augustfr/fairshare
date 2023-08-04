import { SlashCommandBuilder } from "@discordjs/builders";

const ratesCommand = new SlashCommandBuilder()
  .setName("rates")
  .setDescription("View current rates");

export default ratesCommand.toJSON();
