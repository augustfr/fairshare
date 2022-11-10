import { SlashCommandBuilder } from '@discordjs/builders';

const initCommand = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join the group!');

export default initCommand.toJSON();