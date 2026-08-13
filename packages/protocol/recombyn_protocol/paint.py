"""Open Paint / Decide tool_ops contracts."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

PAINT_OP_META_KEYS = frozenset(
    {
        "name",
        "tool",
        "type",
        "op",
        "op_key",
        "opKey",
        "args",
        "parameters",
        "arguments",
        "properties",
        "props",
        "updates",
        "params",
        "op_id",
        "opId",
    }
)
PAINT_OP_NEST_ARG_KEYS = (
    "args",
    "parameters",
    "arguments",
    "properties",
    "props",
    "updates",
    "params",
)
PAINT_OP_NAME_ALIASES = ("name", "tool", "op", "op_key", "opKey")
PAINT_CREATE_SHAPE_NAMES = frozenset(
    {
        "create_shape",
        "create_text",
        "create_image",
        "create_frame",
        "update_node",
        "delete_nodes",
        "delete_frame",
        "create_svg",
        "create_icon",
    }
)


def paint_op_name(d: dict[str, Any]) -> str:
    for key in PAINT_OP_NAME_ALIASES:
        raw = d.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    type_as_name = str(d.get("type") or "").strip()
    if type_as_name in PAINT_CREATE_SHAPE_NAMES:
        return type_as_name
    return ""


def merge_nested_op_args(d: dict[str, Any]) -> dict[str, Any]:
    args: dict[str, Any] = {}
    for nest_key in PAINT_OP_NEST_ARG_KEYS:
        nested = d.get(nest_key)
        if not isinstance(nested, dict):
            continue
        for nk, nv in nested.items():
            args.setdefault(nk, nv)
    if not args:
        return {k: v for k, v in d.items() if k not in PAINT_OP_META_KEYS}
    for k, v in d.items():
        if k not in PAINT_OP_META_KEYS:
            args.setdefault(k, v)
    return args


def coalesce_paint_tool_op(data: Any) -> Any:
    """Normalize one tool_op envelope to ``{name, args}`` (accepts parameters)."""
    if not isinstance(data, dict):
        return data
    d = dict(data)
    name = paint_op_name(d)
    args = merge_nested_op_args(d)
    if (
        name == "create_shape"
        and args.get("shapeType") is None
        and d.get("type") is not None
        and str(d.get("type")) not in {"create_shape"}
    ):
        args.setdefault("shapeType", d.get("type"))
    return {"name": name, "args": args}


class PaintToolOp(BaseModel):
    """LangChain envelope for one canvas op — normalized to ``{name, args}``."""

    name: str = Field(..., min_length=1)
    args: dict[str, Any] = Field(
        default_factory=dict,
        description="Canvas op arguments. Prefer key 'args'; 'parameters' also accepted.",
    )

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _coalesce_flat_op(cls, data: Any) -> Any:
        return coalesce_paint_tool_op(data)


class AgentTurnSchema(BaseModel):
    """LangChain structured agent turn (canvas tool_ops stay FE-applied)."""

    thought: str = ""
    intent: str = "chat"
    reply: str = ""
    tool_ops: list[PaintToolOp] = Field(default_factory=list)
    ops: list[PaintToolOp] = Field(default_factory=list)
    need_tools: list[Any] = Field(default_factory=list)
    need_skills: list[Any] = Field(default_factory=list)
    need_subagents: list[Any] = Field(default_factory=list)
    choices: list[Any] = Field(default_factory=list)
    apply_choice: str = ""
    applyChoice: str = ""
    choice_ui: Any = None
    choiceUi: Any = None
    ask_ui: Any = None
    done: bool | None = None
    needTools: list[Any] = Field(default_factory=list)
    needSkills: list[Any] = Field(default_factory=list)
    needSubagents: list[Any] = Field(default_factory=list)
    tools_needed: list[Any] = Field(default_factory=list)

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _alias_ops_to_tool_ops(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if not d.get("tool_ops") and d.get("ops"):
            d["tool_ops"] = d.get("ops")
        return d


class DecideTurnSchema(BaseModel):
    """Decision stage only — never emits canvas ops (paint_ops node does that)."""

    thought: str = ""
    intent: str = "chat"
    reply: str = ""
    need_tools: list[Any] = Field(default_factory=list)
    need_skills: list[Any] = Field(default_factory=list)
    need_subagents: list[Any] = Field(default_factory=list)
    choices: list[Any] = Field(default_factory=list)
    choice_ui: Any = None
    design_brief: Any = None
    done: bool | None = None

    model_config = {"extra": "allow"}


class PaintOpsSchema(BaseModel):
    """Paint stage — LangChain validates op envelope; host validates canvas semantics."""

    tool_ops: list[PaintToolOp] = Field(default_factory=list)
    intent: str = "create"
    reply: str = ""

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _alias_ops_to_tool_ops(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if not d.get("tool_ops") and d.get("ops"):
            d["tool_ops"] = d.get("ops")
        return d

    @field_validator("tool_ops", mode="before")
    @classmethod
    def _coerce_tool_ops_list(cls, value: Any) -> Any:
        if value is None:
            return []
        if isinstance(value, dict):
            return [value]
        return value
