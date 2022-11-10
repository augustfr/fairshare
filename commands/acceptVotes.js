import { SlashCommandBuilder } from '@discordjs/builders';

const acceptCommand = new SlashCommandBuilder()
    .setName('accept_votes')
    .setDescription('Accept the votes');

export default acceptCommand.toJSON();