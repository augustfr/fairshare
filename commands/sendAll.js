import { SlashCommandBuilder } from "@discordjs/builders";

const sendAllCommand = new SlashCommandBuilder()
  .setName("send_to_all")
  .setDescription("Send shares to everyone in your group!")
  .addNumberOption((option) =>
    option
      .setName("amount")
      .setDescription("The amount to send to EACH member")
      .setRequired(true)
  );

export default sendAllCommand.toJSON();
