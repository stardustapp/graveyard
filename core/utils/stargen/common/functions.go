package common

type FunctionDef struct {
	Name         string
	InputShape   string
	OutputShape  string
	ContextShape string // effectively 'this'
	Source       string
}

func (g *Stargen) ListFunctions() []FunctionDef {
	folder, ok := g.DriverCtx.GetFolder("/functions")
	if !ok {
		return nil // TODO: only if 404
	}

	funcs := make([]FunctionDef, len(folder.Children()))
	for idx, child := range folder.Children() {
		funcs[idx].Name = child
		funcs[idx].InputShape = g.readFuncStr(child, "input-shape")
		funcs[idx].OutputShape = g.readFuncStr(child, "output-shape")
		funcs[idx].ContextShape = g.readFuncStr(child, "context-shape")

		// TODO
		sourcePath := "/functions/" + child + "/source.go"
		if file, ok := g.DriverCtx.GetFile(sourcePath); ok {
			funcs[idx].Source = string(file.Read(0, int(file.GetSize())))
		}
	}
	return funcs
}

func (g *Stargen) readFuncStr(funcName string, limbName string) string {
	limbPath := "/functions/" + funcName + "/" + limbName
	if str, ok := g.DriverCtx.GetString(limbPath); ok {
		return str.Get()
	}
	return ""
}
