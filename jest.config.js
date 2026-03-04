module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['**/*.ts', '!**/node_modules/**', '!**/dashboard/public/**']
};
