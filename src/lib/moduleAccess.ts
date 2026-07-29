import { PROCEDURE_CATALOG, type ServiceCategoryId } from "@/lib/types";

/**
 * The Supabase `modules` table (joined through `clinic_module_access`) uses its own
 * uppercase ids -- INJECTABLES, PMU, SURGICAL -- which do not exactly match this app's
 * ServiceCategoryId values (SURGICAL maps to plastic_surgery, not just a casing change).
 * This is the single place that reconciles the two so the mapping only lives once.
 */
const MODULE_ID_TO_CATEGORY: Record<string, ServiceCategoryId> = {
    INJECTABLES: "injectables",
    PMU: "pmu",
    SURGICAL: "plastic_surgery",
};

/**
 * Expands a clinic's unlocked module ids (clinic_module_access.module_id) into the full
 * list of PROCEDURE_CATALOG procedure ids that clinic is licensed to offer. Feed the
 * result straight into VisualizerApp's allowedProcedureIds prop.
 */
export function getAllowedProcedureIds(moduleIds: string[]): string[] {
    const categories = new Set(
          moduleIds
            .map((id) => MODULE_ID_TO_CATEGORY[id])
            .filter((c): c is ServiceCategoryId => Boolean(c))
        );
    return PROCEDURE_CATALOG.filter((p) => categories.has(p.category)).map((p) => p.id);
}
