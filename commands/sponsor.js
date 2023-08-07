import { SlashCommandBuilder } from "@discordjs/builders";

const sponsorCommand = new SlashCommandBuilder()
  .setName("sponsor")
  .setDescription("Sponsor a user to join the group!")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user you'd like to sponsor")
      .setRequired(true)
  );

export default sponsorCommand.toJSON();
