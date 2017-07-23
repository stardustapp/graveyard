package skylink

import (
	"log"
	"strings"

	"github.com/stardustapp/core/base"
)

type Enumerator struct {
	ctx      base.Context
	root     base.Entry
	shapes   map[string]base.Shape
	maxDepth int
	output   chan nsEntry
	ok       bool
}

func NewEnumerator(ctx base.Context, root base.Entry, maxDepth int) *Enumerator {
	return &Enumerator{
		ctx:      ctx,
		root:     root,
		maxDepth: maxDepth,
		shapes:   make(map[string]base.Shape),
		ok:       true,
	}
}

func (e *Enumerator) AddShapeByPath(path string) bool {
	if shape, ok := e.ctx.GetShape(path); ok {
		e.shapes[path] = shape
		return true
	} else {
		log.Println("nsapi enumeration: couldn't resolve shape", path)
		//e.ok = false
		return false
	}
}

func (e *Enumerator) Run() <-chan nsEntry {
	log.Println("nsapi: matching entries against", len(e.shapes), "shapes")

	e.output = make(chan nsEntry, 5)
	go e.enumerate(0, "", e.root)
	return e.output
}

func (e *Enumerator) IsOk() bool {
	return e.ok
}

func (e *Enumerator) checkShapes(ent base.Entry) []string {
	shapes := make([]string, 0)
	for id, shape := range e.shapes {
		if shape.Check(e.ctx, ent) {
			shapes = append(shapes, id)
		}
	}
	return shapes
}

func (e *Enumerator) enumerate(depth int, path string, src base.Entry) {
	ent := nsEntry{
		Name:   path,
		Type:   "Unknown",
		Shapes: e.checkShapes(src),
	}

	switch entry := src.(type) {

	case base.Shape:
		ent.Type = "Shape"

	case base.Function:
		ent.Type = "Function"

	case base.Folder:
		ent.Type = "Folder"

	case base.String:
		// Strings are supposed to be lightweight, so include values
		ent.Type = "String"
		ent.StringValue = entry.Get()

	case base.Link:
		ent.Type = "Link"
		ent.StringValue = entry.Target()

	case base.File:
		ent.Type = "File"

	}
	e.output <- ent

	// Recurse if the thing is a Folder and we have depth
	if depth < e.maxDepth || e.maxDepth == -1 {
		if entry, ok := src.(base.Folder); ok {
			for _, name := range entry.Children() {
				child, ok := entry.Fetch(name)
				if ok {
					e.enumerate(depth+1, strings.TrimPrefix(path+"/"+name, "/"), child)
				} else {
					log.Println("enumerate: Couldn't get", name, "from", path)
				}
			}
		}
	}

	// Close if we're the last thing
	if depth == 0 {
		close(e.output)
	}
}
