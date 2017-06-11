package common

import (
  "log"
)

type ShapeDef struct {
  Name string
  Type string
  Props []PropDef
  NativeProps []PropDef
}

type PropDef struct {
  Name string
  Type string
  Target string // name of driver resource to point to
}

func (g *Stargen) ListShapes() []ShapeDef {
  folder, err := g.Orbiter.LoadFolder(g.DriverPath + "/shapes")
  if err != nil {
    panic(err.Error())
  }

  shapes := make([]ShapeDef, len(folder.Children))
  for idx, child := range folder.Children {
    shapes[idx].Name = child.Name
    shapes[idx].Type = "Folder" // TODO!!
    shapes[idx].Props = g.readProps(child.Name, "props")
    shapes[idx].NativeProps = g.readProps(child.Name, "native-props")
  }
  return shapes
}

func (g *Stargen) readProps(shapeName string, propType string) []PropDef {
  propRoot := g.DriverPath + "/shapes/" + shapeName + "/" + propType
  folder, err := g.Orbiter.LoadFolder(propRoot)
  if err != nil {
    return nil // TODO: only if 404
  }

  log.Println("shape props:", folder)

  props := make([]PropDef, len(folder.Children))
  for idx, child := range folder.Children {
    props[idx].Name = child.Name
    log.Println("handling prop", child.Name, child.Type)
    switch child.Type {

    case "String":
      // shorthand for simple props
      props[idx].Type, _ = g.Orbiter.ReadString(propRoot + "/" + child.Name)

    case "Folder":
      // TODO: only fetch children that exist
      //subFolder, _ := g.Orbiter.LoadFolder(propRoot + "/" + child.Name)
      props[idx].Type, _ = g.Orbiter.ReadString(propRoot + "/" + child.Name + "/type")
      props[idx].Target, _ = g.Orbiter.ReadString(propRoot + "/" + child.Name + "/target")

    default:
      panic("Property at " + propRoot + "/" + child.Name + " was a weird type " + child.Type)
    }
  }
  return props
}
