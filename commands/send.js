import { SlashCommandBuilder } from '@discordjs/builders';

const sendCommand = new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send currency')
    .addNumberOption(option => 
        option.setName('amount')
            .setDescription('The amount to send')
            .setRequired(true))
    .addUserOption(option =>
		option.setName('user')
            .setDescription('User to send to')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('message')
            .setDescription('Reason for sending'));

export default sendCommand.toJSON();