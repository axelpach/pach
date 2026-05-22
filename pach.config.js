export const projects = {
    ardia: {
        local: '~/Desktop/Developer/ardia',
        github: 'axelpach/ardia',
        branch: 'main',
        contextDir: './projects/ardia',
        tools: ['decks', 'crm'],
        whatsapp: {
            kapsoApiKeyEnv: 'ARDIA_KAPSO_API_KEY',
            phoneNumberIdEnv: 'ARDIA_WHATSAPP_PHONE_NUMBER_ID',
            wabaIdEnv: 'ARDIA_WHATSAPP_BUSINESS_ACCOUNT_ID',
            defaultLanguageCode: 'es_MX',
        },
    },
    /**
     * Marketing WABA for Ardia. Separate Mexican number registered through
     * Kapso so its quality rating + templates are isolated from the
     * transactional ardia WABA above. Pach owns the marketing template
     * definitions for this WABA.
     */
    'ardia-mkt': {
        local: '~/Desktop/Developer/ardia',
        github: 'axelpach/ardia',
        branch: 'main',
        contextDir: './projects/ardia',
        tools: ['crm'],
        whatsapp: {
            kapsoApiKeyEnv: 'ARDIA_KAPSO_API_KEY',
            phoneNumberIdEnv: 'ARDIA_MKT_WHATSAPP_PHONE_NUMBER_ID',
            wabaIdEnv: 'ARDIA_MKT_WHATSAPP_BUSINESS_ACCOUNT_ID',
            defaultLanguageCode: 'es_MX',
        },
    },
};
export const config = {
    databaseUrl: process.env.DATABASE_URL || 'postgres://pach:pach@localhost:5435/pach',
    portal: {
        port: 5174,
    },
};
