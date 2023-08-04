import { SlashCommandBuilder } from "@discordjs/builders";

const marketRemoveCommand = new SlashCommandBuilder()
  .setName("market_remove")
  .setDescription("Remove a marketplace item")
  .addNumberOption((option) =>
    option
      .setName("index")
      .setDescription(
        "The item to remove. If you don't know the index, run the '/market' command"
      )
      .setRequired(true)
  );

export default marketRemoveCommand.toJSON();
