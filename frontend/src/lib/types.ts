export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  doc_type: "caiet_de_sarcini" | "fisa_de_date" | "propunere_tehnica";
  original_filename: string;
  file_size_bytes: number | null;
  heading_count: number | null;
  paragraph_count: number | null;
  processing_status: string;
  processing_error: string | null;
  processing_warning: string | null;
  created_at: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  requirement_text: string;
  original_text: string;
  hierarchy_path: string | null;
  category: string;
  priority: string;
  verification_type: string;
  referenced_standards: string[] | null;
  extraction_confidence: number | null;
  needs_human_review: boolean;
  created_at: string;
}

export interface EvaluationRun {
  id: string;
  project_id: string;
  status: string;
  total_requirements: number;
  evaluated_count: number;
  conform_count: number;
  neconform_count: number;
  partial_count: number;
  insufficient_count: number;
  needs_review_count: number;
  error_count: number;
  estimated_cost_usd: number | string;
  run_config: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvaluationResult {
  id: string;
  requirement_id: string;
  verdict: "CONFORM" | "NECONFORM" | "PARTIAL" | "INSUFFICIENT_DATA";
  confidence_score: number;
  reasoning: string;
  proposal_quotes: Array<{ quote: string; fragment_number: number; relevance: string }>;
  covered_aspects: string[];
  missing_aspects: string[];
  all_quotes_verified: boolean;
  needs_human_review: boolean;
  human_verdict: string | null;
  created_at: string;
}

export interface Analytics {
  verdict_distribution: Record<string, number>;
  avg_confidence: number;
  quote_verification_rate: number;
  needs_review_count: number;
  error_count: number;
  total_evaluated: number;
  health_warnings: string[];
}

export const DOC_TYPES: Record<string, string> = {
  caiet_de_sarcini: "Caiet de Sarcini",
  fisa_de_date: "Fișa de Date",
  propunere_tehnica: "Propunere Tehnică",
};

export const DOC_TYPE_SHORT: Record<string, string> = {
  caiet_de_sarcini: "CS",
  fisa_de_date: "FDA",
  propunere_tehnica: "PT",
};

export type StatusDot = "" | "ok" | "warn" | "err" | "live";

export const STATUS_MAP: Record<string, { label: string; dot: StatusDot }> = {
  created:                { label: "Creat",                dot: "warn" },
  processing:             { label: "Procesare",            dot: "live" },
  documents_ready:        { label: "Documente procesate",  dot: "ok"   },
  requirements_extracted: { label: "Cerințe extrase",      dot: "ok"   },
  requirements_validated: { label: "Cerințe validate",     dot: "ok"   },
  evaluation_running:     { label: "Evaluare în curs",     dot: "live" },
  evaluated:              { label: "Evaluat",              dot: "ok"   },
  completed:              { label: "Complet",              dot: "ok"   },
  error:                  { label: "Eroare",               dot: "err"  },
};

export const PRIORITY_LABELS: Record<string, string> = {
  obligatoriu: "Obligatoriu",
  recomandat:  "Recomandat",
  optional:    "Opțional",
  informativ:  "Informativ",
};

export const CATEGORY_LABELS: Record<string, string> = {
  tehnic:        "Tehnic",
  materiale:     "Materiale",
  calitate:      "Calitate",
  termene:       "Termene",
  personal:      "Personal",
  echipamente:   "Echipamente",
  administrativ: "Administrativ",
};

export const VERIFICATION_TYPE_LABELS: Record<string, string> = {
  match_value:       "match_value",
  match_reference:   "match_reference",
  match_description: "match_description",
  unverifiable:      "unverifiable",
};

export const PIPELINE_STAGES = [
  { key: "documents",    label: "Documente",   sub: "Parsare, indexare, chunking" },
  { key: "requirements", label: "Cerințe",     sub: "Extragere atomică via LLM"   },
  { key: "evaluation",   label: "Evaluare",    sub: "Retrieval + verdicte"        },
  { key: "report",       label: "Raport",      sub: "Sinteză și export"           },
] as const;

export function statusToStageIndex(status: string): number {
  switch (status) {
    case "created":
    case "processing":
      return 0;
    case "documents_ready":
      return 1;
    case "requirements_extracted":
    case "requirements_validated":
      return 2;
    case "evaluation_running":
      return 2;
    case "evaluated":
    case "completed":
      return 3;
    default:
      return 0;
  }
}
