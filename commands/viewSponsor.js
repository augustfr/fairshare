import { SlashCommandBuilder } from "@discordjs/builders";

const viewSponsorCommand = new SlashCommandBuilder()
  .setName("view_sponsor")
  .setDescription("View who a member was originally sponsored by")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user you'd like to check")
      .setRequired(true)
  );

export default viewSponsorCommand.toJSON();
