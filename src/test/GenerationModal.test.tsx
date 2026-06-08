import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GenerationModal } from "@/components/generation/GenerationModal";
import { useGeneration } from "@/components/hooks/useGeneration";

vi.mock("@/components/hooks/useGeneration", () => ({
  useGeneration: vi.fn(),
}));
vi.mock("@/components/generation/GenerationFlow", () => ({
  GenerationFlow: () => null,
}));

const mockedUseGeneration = vi.mocked(useGeneration);

afterEach(() => {
  vi.restoreAllMocks();
});

function setupMock(phase: "input" | "generating" | "reviewing") {
  const reset = vi.fn();
  mockedUseGeneration.mockReturnValue({
    phase,
    reset,
    text: "",
    setText: vi.fn(),
    proposals: [],
    errorMessage: null,
    generate: vi.fn(),
    updateProposal: vi.fn(),
    bulkAccept: vi.fn(),
    bulkReject: vi.fn(),
    saveProposals: vi.fn(),
  });
  return { reset };
}

describe("GenerationModal — handleCloseRequest", () => {
  it('faza "generating" → pokazuje dialog potwierdzenia', () => {
    const onClose = vi.fn();
    const { reset } = setupMock("generating");

    render(<GenerationModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));

    expect(screen.queryByText(/Zamknąć/)).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('faza "reviewing" → pokazuje dialog potwierdzenia', () => {
    const onClose = vi.fn();
    const { reset } = setupMock("reviewing");

    render(<GenerationModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));

    expect(screen.queryByText(/Zamknąć/)).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('faza "input" → zamyka bezpośrednio', () => {
    const onClose = vi.fn();
    setupMock("input");

    render(<GenerationModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));

    expect(screen.queryByText(/Zamknąć/)).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
