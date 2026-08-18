/**
 * A test harness small enough not to need a test framework.
 *
 * This project has no test runner and adding one for a handful of files would
 * be more machinery than the tests are worth. Compiled with tsc and run with
 * node, these behave like any other script: non-zero exit means failure.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
    try {
        const result = fn();
        if (result instanceof Promise) {
            throw new Error('use asyncTest for promises');
        }
        passed += 1;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed += 1;
        failures.push(`${name}: ${(err as Error).message}`);
        console.error(`  FAIL ${name}`);
        console.error(`       ${(err as Error).message}`);
    }
}

export async function asyncTest(name: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
        passed += 1;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed += 1;
        failures.push(`${name}: ${(err as Error).message}`);
        console.error(`  FAIL ${name}`);
        console.error(`       ${(err as Error).message}`);
    }
}

export function describe(name: string): void {
    console.log(`\n${name}`);
}

export function finish(): void {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
        console.error('\nFailures:');
        for (const failure of failures) console.error(`  - ${failure}`);
    }
    process.exit(failed ? 1 : 0);
}
