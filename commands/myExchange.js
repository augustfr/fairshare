import { SlashCommandBuilder } from "@discordjs/builders";

const myExchangeCommand = new SlashCommandBuilder()
  .setName("my_exchanges")
  .setDescription("View exchange pairs that you are a part of");

export default myExchangeCommand.toJSON();
