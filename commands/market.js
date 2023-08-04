import { SlashCommandBuilder } from "@discordjs/builders";

const marketCommand = new SlashCommandBuilder()
  .setName("market")
  .setDescription("View the current market items");

export default marketCommand.toJSON();
