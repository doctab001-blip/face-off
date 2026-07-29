/** Top-level service lines a facility can be licensed for. A facility selects one or many. */
export type ServiceCategoryId = "plastic_surgery" | "injectables" | "pmu";

export interface ServiceCategory {
  id: ServiceCategoryId;
  label: string;
  shortLabel: string;
  description: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "plastic_surgery",
    label: "Plastic Surgery Procedures",
    shortLabel: "Plastic Surgery",
    description: "Surgical facial procedures such as rhinoplasty and chin augmentation.",
  },
  {
    id: "injectables",
    label: "Injectables",
    shortLabel: "Injectables",
    description: "Non-surgical fillers and neuromodulators (lips, cheeks, brows).",
  },
  {
    id: "pmu",
    label: "Permanent Makeup (PMU)",
    shortLabel: "PMU",
    description: "Cosmetic tattooing such as microblading and lip blush.",
  },
];

export interface FaceLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * A specific procedure/technique a facility can offer. `feature`/`technique` map to
 * VisualizerApp's internal FeatureType + technique-map keys when `simulated` is true —
 * this is the join key between the facility bundle builder and the live simulator's
 * gating logic. Entries with `simulated: false` are catalog-only (shown to facilities as
 * an offerable service) with no working toggle in the visualizer yet.
 */
export interface ProcedureCatalogEntry {
  id: string;
  category: ServiceCategoryId;
  label: string;
  description: string;
  simulated: boolean;
  feature?: string;
  technique?: string;
}

export const PROCEDURE_CATALOG: ProcedureCatalogEntry[] = [
  // --- Plastic Surgery ---
  {
    id: "rhinoplasty",
    category: "plastic_surgery",
    label: "Rhinoplasty (Nose Reshaping)",
    description: "Simulate changes to the bridge, tip, and nostrils.",
    simulated: true,
    feature: "nose",
    technique: "straight_slim",
  },
  {
    id: "mentoplasty",
    category: "plastic_surgery",
    label: "Mentoplasty (Chin Augmentation/Reduction)",
    description: "Simulate implants or bone shaving to balance the side profile.",
    simulated: true,
    feature: "chin",
    technique: "anterior_projection",
  },
  {
    id: "bichectomy",
    category: "plastic_surgery",
    label: "Bichectomy (Buccal Fat Removal)",
    description: "Simulate a more contoured, slimmer cheek and jawline.",
    simulated: true,
    feature: "jawline",
    technique: "buccal_fat_removal",
  },
  {
    id: "blepharoplasty",
    category: "plastic_surgery",
    label: "Blepharoplasty (Eyelid Surgery)",
    description: "Simulate removal of excess skin on the upper/lower eyelids.",
    simulated: false,
  },
  {
    id: "rhytidectomy",
    category: "plastic_surgery",
    label: "Rhytidectomy (Facelift)",
    description: "Simulate tightening of the lower face and jowls.",
    simulated: false,
  },
  {
    id: "otoplasty",
    category: "plastic_surgery",
    label: "Otoplasty (Ear Pinning)",
    description: "Visualize ears pinned closer to the head.",
    simulated: false,
  },
  {
    id: "lip_lift",
    category: "plastic_surgery",
    label: "Lip Lift",
    description: "Simulate shortening the space between the nose and upper lip.",
    simulated: false,
  },

  // --- Injectables ---
  {
    id: "lip_augmentation",
    category: "injectables",
    label: "Lip Augmentation (Fillers)",
    description: "Russian lip, standard volumizing, and border-definition filler techniques.",
    simulated: true,
    feature: "upper_lip",
    technique: "russian",
  },
  {
    id: "lip_flip",
    category: "injectables",
    label: "Lip Flip",
    description: "Relax the muscle above the lip to roll it slightly outward.",
    simulated: true,
    feature: "upper_lip",
    technique: "lip_flip",
  },
  {
    id: "mid_face_filler",
    category: "injectables",
    label: "Mid-Face / Cheek Filler",
    description: "Restore lost volume in the cheekbones and midface.",
    simulated: true,
    feature: "cheeks",
    technique: "malar_volume",
  },
  {
    id: "liquid_rhinoplasty",
    category: "injectables",
    label: "Liquid Rhinoplasty",
    description: "Non-surgical nose job using filler to smooth bumps.",
    simulated: true,
    feature: "nose",
    technique: "liquid_rhino",
  },
  {
    id: "jawline_contouring",
    category: "injectables",
    label: "Jawline Contouring",
    description: "Create a sharper, more defined jaw angle with filler.",
    simulated: true,
    feature: "jawline",
    technique: "jawline_slim",
  },
  {
    id: "chin_filler",
    category: "injectables",
    label: "Chin Filler",
    description: "Elongate the face or project a weak chin, non-surgically.",
    simulated: true,
    feature: "chin",
    technique: "chin_filler",
  },
  {
    id: "masseter_reduction",
    category: "injectables",
    label: "Masseter Reduction",
    description: "Slim the jawline and treat teeth grinding with neuromodulator.",
    simulated: true,
    feature: "jawline",
    technique: "masseter_reduction",
  },
  {
    id: "tear_trough_filler",
    category: "injectables",
    label: "Tear Trough Filler",
    description: "Fill hollows under the eyes to reduce the appearance of dark circles.",
    simulated: false,
  },
  {
    id: "nasolabial_fold_filler",
    category: "injectables",
    label: "Nasolabial Folds (Smile Lines)",
    description: "Soften the lines from the nose to the mouth.",
    simulated: false,
  },
  {
    id: "upper_face_smoothing",
    category: "injectables",
    label: "Upper Face Smoothing (Botox)",
    description: "Forehead lines, glabella/frown lines, and crow's feet.",
    simulated: false,
  },

  // --- PMU (Permanent Makeup) ---
  {
    id: "microblading",
    category: "pmu",
    label: "Microblading",
    description: "Simulate hair-like strokes for natural-looking brows.",
    simulated: true,
    feature: "brows",
    technique: "microblading",
  },
  {
    id: "ombre_powder_brows",
    category: "pmu",
    label: "Ombré / Powder Brows",
    description: "Simulate a soft, filled-in makeup look, lighter at the front, darker at the tail.",
    simulated: true,
    feature: "brows",
    technique: "ombre_powder",
  },
  {
    id: "combination_brows",
    category: "pmu",
    label: "Combination Brows",
    description: "A mix of hair-like strokes and shading.",
    simulated: true,
    feature: "brows",
    technique: "hybrid_tint",
  },
  {
    id: "lip_blushing",
    category: "pmu",
    label: "Lip Blushing",
    description: "Simulate a sheer tint across the lip to enhance natural color and symmetry.",
    simulated: true,
    feature: "lip_pmu",
    technique: "lip_blushing",
  },
  {
    id: "lip_neutralization",
    category: "pmu",
    label: "Lip Neutralization",
    description: "Simulate correction of dark or cool-toned lips.",
    simulated: true,
    feature: "lip_pmu",
    technique: "lip_neutralization",
  },
  {
    id: "lip_liner_pmu",
    category: "pmu",
    label: "Lip Liner",
    description: "Simulate a defined, semi-permanent lip border.",
    simulated: true,
    feature: "lip_pmu",
    technique: "lip_liner",
  },
  {
    id: "lash_enhancement",
    category: "pmu",
    label: "Lash Enhancement",
    description: "Subtle pigment applied only in the lash line for gentle thickness.",
    simulated: true,
    feature: "eyeliner",
    technique: "lash_enhancement",
  },
  {
    id: "classic_eyeliner",
    category: "pmu",
    label: "Classic Eyeliner",
    description: "Simulate a distinct, thin classic eyeliner look.",
    simulated: true,
    feature: "eyeliner",
    technique: "classic",
  },
  {
    id: "winged_eyeliner",
    category: "pmu",
    label: "Winged Eyeliner",
    description: "Simulate a winged eyeliner look with an upward flick.",
    simulated: true,
    feature: "eyeliner",
    technique: "winged",
  },
];
