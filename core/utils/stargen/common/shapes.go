package common

import (
	"log"

	"github.com/stardustapp/core/base"
)

type ShapeDef struct {
	Name        string
	Type        string
	Props       []PropDef
	NativeProps []PropDef
}

type PropDef struct {
	Name     string
	Type     string
	Optional *bool
	Target   string // name of driver resource to point to
}

func (g *Stargen) ListShapes() []ShapeDef {
	folder, ok := g.DriverCtx.GetFolder("/shapes")
	if !ok {
		return nil // TODO: only if 404
	}

	shapes := make([]ShapeDef, len(folder.Children()))
	for idx, child := range folder.Children() {
		shapes[idx].Name = child
		shapes[idx].Type = "Folder" // TODO!!
		shapes[idx].Props = g.readProps(child, "props")
		shapes[idx].NativeProps = g.readProps(child, "native-props")
	}
	return shapes
}

func (g *Stargen) readProps(shapeName string, propType string) []PropDef {
	propRoot := "/shapes/" + shapeName + "/" + propType
	folder, ok := g.DriverCtx.GetFolder(propRoot)
	if !ok {
		return nil // TODO: only if 404
	}

	log.Println("shape props:", folder)

	props := make([]PropDef, len(folder.Children()))
	for idx, childName := range folder.Children() {
		props[idx].Name = childName
		child, _ := folder.Fetch(childName)

		log.Println("handling prop", childName)
		switch child := child.(type) {

		case base.String:
			// shorthand for simple props
			props[idx].Type = child.Get()

		case base.Folder:
			// TODO: only fetch children that exist

			if typeEnt, ok := child.Fetch("type"); ok {
				if typeStr, ok := typeEnt.(base.String); ok {
					props[idx].Type = typeStr.Get()
				}
			}

			if targetEnt, ok := child.Fetch("target"); ok {
				if targetStr, ok := targetEnt.(base.String); ok {
					props[idx].Target = targetStr.Get()
				}
			}

			if optionalEnt, ok := child.Fetch("optional"); ok {
				if optionalStr, ok := optionalEnt.(base.String); ok {
					props[idx].Optional = parseBool(optionalStr.Get())
				}
			}

		default:
			log.Println("weird prop:", child)
			panic("Property at " + propRoot + "/" + childName + " was a weird type")
		}
	}
	return props
}

func parseBool(str string) *bool {
	b := str == "yes"
	return &b
}
