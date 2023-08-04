import { SlashCommandBuilder } from "@discordjs/builders";

const withdrawCommand = new SlashCommandBuilder()
  .setName("withdraw")
  .setDescription("Withdraw from the current group")
  .addBooleanOption((option) =>
    option
      .setName("confirm")
      .setDescription("Select true to move forward with the withdrawal")
      .setRequired(true)
  );

export default withdrawCommand.toJSON();
