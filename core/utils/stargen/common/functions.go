package common

type FunctionDef struct {
  Name string
  InputShape string
  OutputShape string
  ContextShape string // effectively 'this'
  Source string
}

func (g *Stargen) ListFunctions() []FunctionDef {
  folder, err := g.Orbiter.LoadFolder(g.DriverPath + "/functions")
  if err != nil {
    return nil // TODO: only if 404
  }

  funcs := make([]FunctionDef, len(folder.Children))
  for idx, child := range folder.Children {
    funcs[idx].Name = child.Name
    funcs[idx].InputShape = g.readFuncStr(child.Name, "input-shape")
    funcs[idx].OutputShape = g.readFuncStr(child.Name, "output-shape")
    funcs[idx].ContextShape = g.readFuncStr(child.Name, "context-shape")
    funcs[idx].Source = g.readFuncStr(child.Name, "source.go") // TODO
  }
  return funcs
}

func (g *Stargen) readFuncStr(funcName string, limbName string) string {
  limbPath := g.DriverPath + "/functions/" + funcName + "/" + limbName
  str, _ := g.Orbiter.ReadString(limbPath)
  return str
}
