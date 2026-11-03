#!/bin/bash
# Battery de vérification post-restauration + cleanup - Task 29
export PATH=/home/z/.npm-global/bin:$PATH
cd /home/z/my-project/apps/api
pnpm prisma generate > /tmp/battery.log 2>&1
echo "PRISMA_GEN_EXIT=$?" >> /tmp/battery.log
pnpm tsc --noEmit >> /tmp/battery.log 2>&1
echo "TSC_API_EXIT=$?" >> /tmp/battery.log
cd /home/z/my-project/apps/web
pnpm tsc --noEmit >> /tmp/battery.log 2>&1
echo "TSC_WEB_EXIT=$?" >> /tmp/battery.log
cd /home/z/my-project/packages/shared
pnpm tsc --noEmit >> /tmp/battery.log 2>&1
echo "TSC_SHARED_EXIT=$?" >> /tmp/battery.log
cd /home/z/my-project/apps/web
pnpm vitest run >> /tmp/battery.log 2>&1
echo "WEB_TESTS_EXIT=$?" >> /tmp/battery.log
cd /home/z/my-project/apps/api
pnpm vitest run >> /tmp/battery.log 2>&1
echo "API_TESTS_EXIT=$?" >> /tmp/battery.log
cd /home/z/my-project
node apps/web/scripts/check-prod-mock-leakage.mjs >> /tmp/battery.log 2>&1
echo "GUARD_MOCK_EXIT=$?" >> /tmp/battery.log
pnpm audit --prod >> /tmp/battery.log 2>&1
echo "AUDIT_EXIT=$?" >> /tmp/battery.log
echo "BATTERY_DONE" >> /tmp/battery.log
