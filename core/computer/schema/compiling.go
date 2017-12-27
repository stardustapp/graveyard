package schema

import (
	"errors"
	"log"

	"github.com/stardustapp/core/base"
)

func (ts *TypeSpec) Compile(typeBrowser *base.Resolver) (struct{}, error) {
	log.Println("schema compiling here!", ts.Name)

	if ts.Optional {
		return struct{}{}, errors.New("Root types must not have the Optional flag set")
	}

	return struct{}{}, nil
}

type TypeDef struct {
	Name     string    // only for metadata
	HashCode uint64    // Generated from other fields and locked
	Slots    []SlotDef // Places where data is stored
	//    ^----.
	Fields []FieldDef // Ways of accessing data
}

type FieldDef struct {
	SlotIdx int
	Name    string
}

type SlotDef struct {
	RawType string
}
