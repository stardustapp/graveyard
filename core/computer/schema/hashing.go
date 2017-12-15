package schema

import (
  "bytes"
  "fmt"
  "strings"
  "hash/fnv"
)

// Cute lil helper to build formatted buffers
type stringBuilder struct {
  bytes.Buffer
}
func (sb *stringBuilder) Appendf(format string, a ...interface{}) {
  sb.WriteString(fmt.Sprintf(format, a...))
}
func (sb *stringBuilder) AppendIndented(block string) {
  indented := "  "+strings.Replace(block, "\n", "\n  ", -1)
  sb.WriteString(strings.TrimRight(indented, " "))
}

func (s *SchemaSpec) AsCanon(recursive bool) string {
  var buffer stringBuilder

  for _, t := range s.Types {
    buffer.Appendf("type %q 0x%016x\n", t.Name, t.HashCode())
    if recursive {
      buffer.AppendIndented(t.AsCanon(true))
    }
  }
  for _, f := range s.Functions {
    buffer.Appendf("func %q 0x%016x\n", f.Name, f.HashCode())
    if recursive {
      buffer.AppendIndented(f.AsCanon(true))
    }
  }

  return buffer.String()
}
func (s *SchemaSpec) HashCode() uint64 {
  hasher := fnv.New64()
  hasher.Write([]byte(s.AsCanon(false)))
  return hasher.Sum64()
}

func (t *TypeSpec) AsCanon(recursive bool) string {
  var buffer stringBuilder
  if t.Name == "" {
    buffer.Appendf("no-name\n")
  } else {
    buffer.Appendf("name %q\n", t.Name)
  }
  if t.Optional {
    buffer.WriteString("optional\n")
  }

  switch {
  case t.StringLiteral != nil:
    buffer.Appendf("string-literal %q\n", *t.StringLiteral)
  case t.TypePath != nil:
    buffer.Appendf("type-path %q\n", *t.TypePath)
  case t.Extend != nil:
    buffer.Appendf("extends 0x%016x\n", t.Extend.HashCode())
    if recursive {
      buffer.AppendIndented(t.Extend.AsCanon(true))
    }
  case t.Struct != nil:
    buffer.WriteString("structure\n")
    for _, f := range t.Struct {
      buffer.Appendf("field %q 0x%016x\n", f.Name, f.HashCode())
      if recursive {
        buffer.AppendIndented(f.AsCanon(true))
      }
    }

  default:
    panic("type '"+t.Name+"' is empty, wtf")
  }
  return buffer.String()
}
func (t *TypeSpec) HashCode() uint64 {
  hasher := fnv.New64()
  hasher.Write([]byte(t.AsCanon(false)))
  return hasher.Sum64()
}

func (f *FunctionSpec) AsCanon(recursive bool) string {
  var buffer stringBuilder
  buffer.Appendf("name %q\n", f.Name)
  buffer.Appendf("runtime %q\n", f.Runtime)

  if f.Meeseek {
    buffer.WriteString("meeseek\n")
  }

  if f.Input != nil {
    buffer.Appendf("input 0x%016x\n", f.Input.HashCode())
    if recursive {
      buffer.AppendIndented(f.Input.AsCanon(true))
    }
  }
  if f.Output != nil {
    buffer.Appendf("output 0x%016x\n", f.Output.HashCode())
    if recursive {
      buffer.AppendIndented(f.Output.AsCanon(true))
    }
  }

  return buffer.String()
}
func (f *FunctionSpec) HashCode() uint64 {
  hasher := fnv.New64()
  hasher.Write([]byte(f.AsCanon(false)))
  return hasher.Sum64()
}

func (e *ExtensionSpec) AsCanon(recursive bool) string {
  var buffer stringBuilder
  buffer.Appendf("type-path %q\n", e.TypePath)
  for _, p := range e.Params {
    buffer.Appendf("param %q 0x%016x\n", p.Name, p.HashCode())
    if recursive {
      buffer.AppendIndented(p.AsCanon(true))
    }
  }
  return buffer.String()
}
func (e *ExtensionSpec) HashCode() uint64 {
  hasher := fnv.New64()
  hasher.Write([]byte(e.AsCanon(false)))
  return hasher.Sum64()
}
