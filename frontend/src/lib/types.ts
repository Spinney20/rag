export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string | null;
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
  updated_at: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  requirement_text: string;
  original_text: string;
  section_reference: string | null;
  hierarchy_path: string | null;
  category: string;
  priority: string;
  verification_type: string;
  is_compound: boolean;
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
  estimated_cost_usd: number | string;  // Decimal from backend — may be number or string
  run_config: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface EvaluationResult {
  id: string;
  requirement_id: string;
  verdict: "CONFORM" | "NECONFORM" | "PARTIAL" | "INSUFFICIENT_DATA";
  confidence_score: number;
  reasoning: string;
  proposal_quotes: Array<{
    quote: string;
    fragment_number: number;
    relevance: string;
  }>;
  covered_aspects: string[];
  missing_aspects: string[];
  all_quotes_verified: boolean;
  needs_human_review: boolean;
  human_verdict: string | null;
  human_note: string | null;
  llm_model: string | null;
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

export const DOC_TYPE_LABELS: Record<string, string> = {
  caiet_de_sarcini: "Caiet de Sarcini",
  fisa_de_date: "Fișa de Date",
  propunere_tehnica: "Propunere Tehnică",
};

export const STATUS_LABELS: Record<string, string> = {
  created: "Creat",
  processing: "Procesare...",
  documents_ready: "Documente gata",
  requirements_extracted: "Cerințe extrase",
  requirements_validated: "Cerințe validate",
  evaluated: "Evaluat",
  completed: "Complet",
};

export const VERDICT_CONFIG: Record<string, { label: string; class: string; icon: string }> = {
  CONFORM: { label: "Conform", class: "badge-conform", icon: "✓" },
  NECONFORM: { label: "Neconform", class: "badge-neconform", icon: "✗" },
  PARTIAL: { label: "Parțial", class: "badge-partial", icon: "◐" },
  INSUFFICIENT_DATA: { label: "Date insuficiente", class: "badge-insufficient", icon: "?" },
};
