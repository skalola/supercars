"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import {
  MARKETING_AUTOMATION_SETTINGS,
  isMarketingAutomationSettingKey,
} from "@/lib/admin/marketing-settings";
import { prisma } from "@/lib/prisma";

export async function updateMarketingAutomationSettingAction(key: string, enabled: boolean) {
  try {
    const session = await assertAdmin();

    if (!isMarketingAutomationSettingKey(key)) {
      return { success: false, message: "Unknown marketing automation setting." };
    }

    const setting = MARKETING_AUTOMATION_SETTINGS.find((item) => item.key === key);
    if (!setting) {
      return { success: false, message: "Unknown marketing automation setting." };
    }

    await prisma.globalSetting.upsert({
      where: { key },
      update: {
        enabled,
        label: setting.label,
        description: setting.description,
        category: "MARKETING_AUTOMATION",
        updatedBy: session.user?.email || session.user?.id || "ADMIN",
      },
      create: {
        key,
        label: setting.label,
        description: setting.description,
        category: "MARKETING_AUTOMATION",
        enabled,
        updatedBy: session.user?.email || session.user?.id || "ADMIN",
      },
    });

    revalidatePath("/admin/marketing");

    return {
      success: true,
      message: `${setting.label} ${enabled ? "enabled" : "disabled"}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update marketing setting.";
    return { success: false, message };
  }
}
