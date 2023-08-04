import { SlashCommandBuilder } from "@discordjs/builders";

const marketAddCommand = new SlashCommandBuilder()
  .setName("market_add")
  .setDescription("Add a marketplace item")
  .addStringOption((option) =>
    option.setName("item").setDescription("The item to add").setRequired(true)
  );

export default marketAddCommand.toJSON();
