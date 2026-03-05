import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup/env.ts', './test/setup/mocks.ts'],
        server: {
            deps: {
                inline: ['zod'],
            },
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/index.ts',
                'src/scripts/**',
                'src/**/*.entity.ts',
                'src/types/**',
                'src/config/env.ts', // Config is environment-dependent
                'src/infrastructure/database/mongodb.ts', // Hard to test process.exit safely
                'src/infrastructure/cache/dragonfly.ts', // Runtime singleton with event listener branches not testable in unit tests
                'src/infrastructure/notifications/**', // Background notification service, not testable without real email infra
            ],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 88,
                statements: 90,
            }
        } as any,
    },
});
