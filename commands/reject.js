import { SlashCommandBuilder } from "@discordjs/builders";

const rejectCommand = new SlashCommandBuilder()
  .setName("reject")
  .setDescription("Reject a new user from joining the group")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user you'd like to reject")
      .setRequired(true)
  );

export default rejectCommand.toJSON();
