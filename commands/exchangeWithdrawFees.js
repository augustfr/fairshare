import { SlashCommandBuilder } from "@discordjs/builders";

const exchangeWithdrawFeesCommand = new SlashCommandBuilder()
  .setName("exchange_withdraw_fees")
  .setDescription(
    "Withdraw your earned fees from an existing exchange pair with an outside user. (Advanced users only)"
  )
  .addIntegerOption((option) =>
    option
      .setName("exchange_id")
      .setDescription("Check '/my_exchanges' if you don't know this ID")
      .setRequired(true)
  );

export default exchangeWithdrawFeesCommand.toJSON();
