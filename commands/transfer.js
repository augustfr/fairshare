import { SlashCommandBuilder } from '@discordjs/builders';

const transferCommand = new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Send currency to another group')
    .addStringOption(option =>
		option.setName('server')
            .setDescription('ServerID for the group you want to send to')
            .setRequired(true))
    .addNumberOption(option => 
        option.setName('amount')
            .setDescription('The amount to send in the currency of the receiving group')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('message')
            .setDescription('Reason for sending'));

export default transferCommand.toJSON();