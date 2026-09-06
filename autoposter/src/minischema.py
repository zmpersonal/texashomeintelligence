"""
minischema.py — a dependency-free validator for the subset of JSON Schema that
`schema/social-feed.schema.json` actually uses.

WHY NOT `jsonschema`: adding a dependency is a 🟡 (ask-first) step and this runs inside a
weekly session with no install step. The schema is small, fixed, and ours.

THE HONESTY PROPERTY THAT MAKES THIS SAFE: **an unrecognised keyword raises.** A subset
validator that silently ignores what it does not implement is worse than no validator — it
reports PASS for constraints it never looked at. Here, if the schema grows a keyword this
file does not implement, validation fails loudly and someone has to either implement it or
consciously adopt `jsonschema` (🟡). It can never quietly under-check.

Implemented: $ref (local `#/$defs/...`), $defs, allOf, type, required, properties,
additionalProperties (as a schema or bool), items, enum, minimum, maximum, minItems,
minLength, format (date-time — advisory, checked as ISO-8601-ish), default (ignored, not a
constraint), and the annotation keywords $schema/$id/title/description/examples.
"""

from __future__ import annotations

import re

_ANNOTATIONS = {"$schema", "$id", "title", "description", "examples", "$comment", "default"}
_IMPLEMENTED = {
    "$ref", "$defs", "allOf", "type", "required", "properties", "additionalProperties",
    "items", "enum", "minimum", "maximum", "minItems", "minLength", "format",
} | _ANNOTATIONS

_TYPES = {
    "object": dict, "array": list, "string": str, "boolean": bool,
    "number": (int, float), "integer": int, "null": type(None),
}

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$")


class SchemaUnsupported(Exception):
    """The schema uses a keyword this validator does not implement. Never ignored."""


def _check_type(value, expected) -> bool:
    names = expected if isinstance(expected, list) else [expected]
    for name in names:
        py = _TYPES.get(name)
        if py is None:
            raise SchemaUnsupported(f"unknown type name: {name!r}")
        # bool is a subclass of int in Python; JSON says they are different types.
        if name in ("number", "integer") and isinstance(value, bool):
            continue
        if isinstance(value, py):
            return True
    return False


def _resolve(ref: str, root: dict) -> dict:
    if not ref.startswith("#/"):
        raise SchemaUnsupported(f"only local refs are supported, got {ref!r}")
    node = root
    for part in ref[2:].split("/"):
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def _validate(value, schema: dict, root: dict, path: str, errors: list[str]) -> None:
    unknown = set(schema) - _IMPLEMENTED
    if unknown:
        raise SchemaUnsupported(
            f"{path or '<root>'}: schema uses unimplemented keyword(s) {sorted(unknown)}; "
            f"implement them here or adopt `jsonschema` (🟡) — do not ignore them"
        )

    if "$ref" in schema:
        _validate(value, _resolve(schema["$ref"], root), root, path, errors)

    for sub in schema.get("allOf", []):
        _validate(value, sub, root, path, errors)

    if "type" in schema and not _check_type(value, schema["type"]):
        errors.append(f"{path or '<root>'}: expected type {schema['type']}, got {type(value).__name__}")
        return  # further keywords assume the type held

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} not in {schema['enum']}")

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: shorter than minLength {schema['minLength']}")
        if schema.get("format") == "date-time" and not _ISO.match(value):
            errors.append(f"{path}: {value!r} is not an ISO-8601 date-time")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: {value} < minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: {value} > maximum {schema['maximum']}")

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path or '<root>'}: missing required field {key!r}")
        props = schema.get("properties", {})
        for key, item in value.items():
            child = f"{path}.{key}" if path else key
            if key in props:
                _validate(item, props[key], root, child, errors)
            elif "additionalProperties" in schema:
                extra = schema["additionalProperties"]
                if extra is False:
                    errors.append(f"{child}: additional property not allowed")
                elif isinstance(extra, dict):
                    _validate(item, extra, root, child, errors)

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: {len(value)} items < minItems {schema['minItems']}")
        if "items" in schema:
            for i, item in enumerate(value):
                _validate(item, schema["items"], root, f"{path}[{i}]", errors)


def validate(instance, schema: dict) -> list[str]:
    """Return a list of human-readable errors. Empty list means valid."""
    errors: list[str] = []
    _validate(instance, schema, schema, "", errors)
    return errors


def assert_valid(instance, schema: dict, what: str = "document") -> None:
    """Raise on the first invalid document. Callers use this before writing an artifact."""
    errors = validate(instance, schema)
    if errors:
        raise ValueError(
            f"{what} failed schema validation ({len(errors)} error(s)):\n  - "
            + "\n  - ".join(errors[:20])
        )
