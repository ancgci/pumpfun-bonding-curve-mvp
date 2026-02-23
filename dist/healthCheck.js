"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function checkEnvironmentVariables() {
    const requiredVars = [
        'SHYFT_GRPC',
        'TELEGRAM_BOT_TOKEN',
        'RPC_URL',
        'PUMPFUN_PROGRAM_ID'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        return {
            status: 'error',
            message: `Variáveis de ambiente faltando: ${missingVars.join(', ')}`,
            details: missingVars
        };
    }
    return {
        status: 'ok',
        message: 'Todas as variáveis de ambiente necessárias estão presentes',
        details: requiredVars
    };
}
async function checkConfigFiles() {
    const requiredFiles = [
        '.env',
        'package.json',
        'tsconfig.json'
    ];
    const missingFiles = requiredFiles.filter(file => !fs_1.default.existsSync(path_1.default.join(__dirname, file)));
    if (missingFiles.length > 0) {
        return {
            status: 'error',
            message: `Arquivos de configuração faltando: ${missingFiles.join(', ')}`,
            details: missingFiles
        };
    }
    return {
        status: 'ok',
        message: 'Todos os arquivos de configuração estão presentes',
        details: requiredFiles
    };
}
async function checkDependencies() {
    try {
        const packageJson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, 'package.json'), 'utf8'));
        const dependencies = Object.keys(packageJson.dependencies || {});
        const devDependencies = Object.keys(packageJson.devDependencies || {});
        if (dependencies.length === 0 && devDependencies.length === 0) {
            return {
                status: 'warning',
                message: 'Nenhuma dependência encontrada no package.json',
                details: { dependencies, devDependencies }
            };
        }
        return {
            status: 'ok',
            message: `Dependências verificadas: ${dependencies.length} dependências, ${devDependencies.length} devDependencies`,
            details: { dependencies, devDependencies }
        };
    }
    catch (error) {
        return {
            status: 'error',
            message: 'Erro ao ler package.json',
            details: error.message
        };
    }
}
async function checkUtilsDirectory() {
    try {
        const utilsDir = path_1.default.join(__dirname, 'utils');
        if (!fs_1.default.existsSync(utilsDir)) {
            return {
                status: 'error',
                message: 'Diretório utils não encontrado',
                details: {}
            };
        }
        const files = fs_1.default.readdirSync(utilsDir);
        const requiredFiles = [
            'hybridExecutor.ts',
            'fetchTokenMetadata.ts',
            'metadataCache.ts'
        ];
        const missingFiles = requiredFiles.filter(file => !files.includes(file));
        if (missingFiles.length > 0) {
            return {
                status: 'warning',
                message: `Arquivos utils faltando: ${missingFiles.join(', ')}`,
                details: { missingFiles, totalFiles: files.length }
            };
        }
        return {
            status: 'ok',
            message: `Diretório utils verificado: ${files.length} arquivos encontrados`,
            details: { files, requiredFiles }
        };
    }
    catch (error) {
        return {
            status: 'error',
            message: 'Erro ao verificar diretório utils',
            details: error.message
        };
    }
}
async function runHealthCheck() {
    console.log('🔍 Executando health check do projeto...\n');
    const checks = [
        { name: 'Variáveis de Ambiente', check: checkEnvironmentVariables },
        { name: 'Arquivos de Configuração', check: checkConfigFiles },
        { name: 'Dependências', check: checkDependencies },
        { name: 'Diretório Utils', check: checkUtilsDirectory }
    ];
    let allPassed = true;
    for (const { name, check } of checks) {
        try {
            const result = await check();
            const statusIcon = result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
            console.log(`${statusIcon} ${name}: ${result.message}`);
            if (result.status === 'error') {
                allPassed = false;
            }
            if (result.status !== 'ok' && Object.keys(result.details).length > 0) {
                console.log(`   Detalhes: ${JSON.stringify(result.details, null, 2)}`);
            }
            console.log('');
        }
        catch (error) {
            console.log(`❌ ${name}: Erro inesperado - ${error.message}`);
            allPassed = false;
            console.log('');
        }
    }
    console.log('---');
    if (allPassed) {
        console.log('✅ Todos os checks de saúde passaram!');
    }
    else {
        console.log('❌ Alguns checks de saúde falharam. Verifique os erros acima.');
    }
}
runHealthCheck();
//# sourceMappingURL=healthCheck.js.map