"""Candidate architectures. Input (B, T, 132) landmark features; output class probabilities."""
from __future__ import annotations

import torch
from torch import nn


class Normalize(nn.Module):
    """Feature standardisation baked into the model, so the exported ONNX needs no client-side preprocessing."""

    def __init__(self, mean: torch.Tensor, std: torch.Tensor):
        super().__init__()
        self.register_buffer("mean", mean.clone().float())
        self.register_buffer("std", std.clone().float().clamp_min(1e-3))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return (x - self.mean) / self.std


class BiGRUClassifier(nn.Module):
    name = "bigru"

    def __init__(self, dim: int, classes: int, hidden: int = 64, dropout: float = 0.3):
        super().__init__()
        self.gru = nn.GRU(dim, hidden, batch_first=True, bidirectional=True)
        self.drop = nn.Dropout(dropout)
        self.head = nn.Linear(hidden * 4, classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h, _ = self.gru(x)
        pooled = torch.cat([h.mean(dim=1), h.amax(dim=1)], dim=-1)
        return self.head(self.drop(pooled))


class TemporalCNNClassifier(nn.Module):
    name = "tcn"

    def __init__(self, dim: int, classes: int, width: int = 96, dropout: float = 0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(dim, width, kernel_size=5, padding=2),
            nn.BatchNorm1d(width),
            nn.ReLU(),
            nn.Conv1d(width, width, kernel_size=5, padding=4, dilation=2),
            nn.BatchNorm1d(width),
            nn.ReLU(),
        )
        self.drop = nn.Dropout(dropout)
        self.head = nn.Linear(width * 2, classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.net(x.transpose(1, 2))
        pooled = torch.cat([h.mean(dim=2), h.amax(dim=2)], dim=-1)
        return self.head(self.drop(pooled))


class ExportWrapper(nn.Module):
    """normalise -> classifier -> softmax. This is what gets exported to ONNX."""

    def __init__(self, norm: Normalize, core: nn.Module):
        super().__init__()
        self.norm = norm
        self.core = core

    def forward(self, landmarks: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.core(self.norm(landmarks)), dim=-1)


ARCHITECTURES = {"bigru": BiGRUClassifier, "tcn": TemporalCNNClassifier}
