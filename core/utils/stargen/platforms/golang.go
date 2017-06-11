package platforms

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/stardustapp/core/extras"
	stargen "github.com/stardustapp/core/utils/stargen/common"
)

func init() {
	stargen.Platforms["golang"] = func(gen *stargen.Stargen) stargen.Platform {
		return &golang{
			gen: gen,
		}
	}
}

type goWriter struct {
	depsAvail map[string]string
	depsUsed  map[string]bool
	buf       bytes.Buffer
}

func newGoWriter(depsAvail map[string]string) *goWriter {
	return &goWriter{
		depsAvail: depsAvail,
		depsUsed:  make(map[string]bool),
	}
}

func (w *goWriter) useDep(key string) {
	if _, ok := w.depsAvail[key]; !ok {
		panic("Tried using undeclared dep: " + key)
	}
	w.depsUsed[key] = true
}

func (w *goWriter) write(tmpl string, args ...interface{}) {
	w.buf.WriteString(fmt.Sprintf(tmpl, args...))
}

func (w *goWriter) bytes() []byte {
	var final bytes.Buffer
	final.WriteString("package main\n\n")

	// only imports that were used
	if len(w.depsUsed) > 0 {
		final.WriteString("import (\n")
		for depKey, _ := range w.depsUsed {
			depSrc := w.depsAvail[depKey]
			final.WriteString(fmt.Sprintf("  %s %s\n", depKey, depSrc))
		}
		final.WriteString(")\n\n")
	}

	final.WriteString(w.buf.String())
	return final.Bytes()
}

type golang struct {
	gen  *stargen.Stargen
	deps map[string]string
}

func (p *golang) loadDeps() {
	p.deps = make(map[string]string)

	// Offer stardust essentials by default
	p.deps["base"] = "\"github.com/danopia/stardust/star-router/base\""
	p.deps["entries"] = "\"github.com/danopia/stardust/star-router/entries\""
	p.deps["inmem"] = "\"github.com/danopia/stardust/star-router/inmem\""
	p.deps["stardust"] = "\"github.com/stardustapp/core/client\""

	deps, _ := p.gen.Orbiter.ReadFile(p.gen.DriverPath + "/deps.txt")
	for _, line := range strings.Split(string(deps), "\n") {
		if strings.HasPrefix(line, "golang ") {
			parts := strings.Split(line, " ")
			p.deps[parts[1]] = parts[2]
		}
	}
}

func (p *golang) GenerateDriver() error {
	log.Println("Generating driver")
	p.gen.Orbiter.Delete(p.gen.CompilePath)
	p.gen.Orbiter.PutFolder(p.gen.CompilePath)
	err := p.gen.Orbiter.PutFolder(p.gen.CompilePath + "/go-src")
	if err != nil {
		panic("Unable to create compile directory " + p.gen.CompilePath)
	}

	shapeDefs := p.gen.ListShapes()
	funcDefs := p.gen.ListFunctions()

	p.loadDeps()
	log.Println("Starting code generation")

	shapeWriter := newGoWriter(p.deps)

	// first write a folder with all the shapes listed
	shapeWriter.write("//////////////////////////////////\n// Shape collection\n\n")
	shapeWriter.write("var AllShapes *inmem.Folder = inmem.NewFolderOf(\"shapes\",\n")
	for _, shape := range shapeDefs {
		improperName := extras.SnakeToCamelLower(shape.Name)
		shapeWriter.write("  %sShape,\n", improperName)
	}
	shapeWriter.write(")\n\n")

	// now write out the shapes themselves
	for _, shape := range shapeDefs {
		shapeWriter.write("//////////////////////////////////\n// Shape: %s\n\n", shape.Name)
		improperName := extras.SnakeToCamelLower(shape.Name)

		shapeWriter.useDep("inmem")
		shapeWriter.write("var %sShape *inmem.Shape = inmem.NewShape(\n", improperName)
		shapeWriter.write("	inmem.NewFolderOf(\"%s\",\n", shape.Name)
		shapeWriter.write("		inmem.NewString(\"type\", \"%s\"),\n", shape.Type)

		switch shape.Type {
		case "Folder":
			shapeWriter.write("		inmem.NewFolderOf(\"props\",\n")
			for _, prop := range shape.Props {
				shapeWriter.write("			inmem.NewFolderOf(\"%s\",\n", prop.Name)
				shapeWriter.write("				inmem.NewString(\"type\", \"%s\"),\n", prop.Type)
				//shapeWriter.write("				inmem.NewString(\"optional\", \"yes\"),\n")
				shapeWriter.write("			),\n")
			}
			shapeWriter.write("		),\n")
		}
		shapeWriter.write("	))\n\n")
	}
	p.gen.Orbiter.PutFile(p.gen.CompilePath + "/go-src/shapes.go", shapeWriter.bytes())


	folderWriter := newGoWriter(p.deps)
	for _, shape := range shapeDefs {
		if shape.Type != "Folder" { // TODO
			log.Println("WARN: Shape", shape.Name, " is not a Folder, not supported yet")
			continue
		}

		folderWriter.write("//////////////////////////////////\n// Folder for shape: %s\n\n", shape.Name)
		properName := extras.SnakeToCamel(shape.Name)

		// Write out the basic struct w/ fields
		folderWriter.write("type %s struct {\n", properName)
		for _, prop := range shape.Props {
			if prop.Type == "Function" {
				continue // functions are exposed virtually
			} else if prop.Type == "String" {
				// let's put raw strings in
				folderWriter.write("  %s string\n", extras.SnakeToCamel(prop.Name))
			} else {
				folderWriter.write("  %s base.%s\n", extras.SnakeToCamel(prop.Name), prop.Type)
				folderWriter.useDep("base")
			}
		}
		for _, prop := range shape.NativeProps {
			folderWriter.write("  %s %s\n", extras.SnakeToCamelLower(prop.Name), prop.Type)
			folderWriter.useDep(strings.TrimPrefix(strings.Split(prop.Type, ".")[0], "*"))
		}
		folderWriter.write("}\n\n")

		// Start the struct to be a Folder
		folderWriter.useDep("base")
		folderWriter.write("var _ base.Folder = (*%s)(nil)\n\n", properName)
		folderWriter.write("func (e *%s) Name() string {\n", properName)
		folderWriter.write("  return \"%s\"\n}\n\n", shape.Name)

		// List the children
		folderWriter.write("func (e *%s) Children() []string {\n", properName)
		folderWriter.write("  return []string{\n")
		for _, prop := range shape.Props {
			folderWriter.write("    \"%s\",\n", prop.Name)
		}
		folderWriter.write("  }\n}\n\n")

		// Enable child fetching
		folderWriter.write("func (e *%s) Fetch(name string) (entry base.Entry, ok bool) {\n", properName)
		folderWriter.write("  switch name {\n\n")
		for _, prop := range shape.Props {
			folderWriter.write("  case \"%s\":\n", prop.Name)

			// functions are exposed directly
			if prop.Type == "Function" {
				folderWriter.write("    return &%sFunc{", extras.SnakeToCamel(prop.Target))
				for _, def := range funcDefs {
					if def.Name == prop.Target && def.ContextShape != "" {
						folderWriter.write("e")
					}
				}
				folderWriter.write("}, true\n\n")
			} else if prop.Type == "String" {
				folderWriter.useDep("inmem")
				folderWriter.write("    return inmem.NewString(\"%s\", e.%s), true\n\n", prop.Name, extras.SnakeToCamel(prop.Name))
			} else {
				folderWriter.write("    return e.%s, true\n\n", extras.SnakeToCamel(prop.Name))
			}
		}
		folderWriter.write("  default:\n    return\n  }\n}\n\n")

		// TODO: this doesn't enable put!
		folderWriter.write("func (e *%s) Put(name string, entry base.Entry) (ok bool) {\n", properName)
		folderWriter.write("  return false\n}\n\n")
	}
	p.gen.Orbiter.PutFile(p.gen.CompilePath+"/go-src/folders.go", folderWriter.bytes())

	funcWriter := newGoWriter(p.deps)
	for _, funct := range funcDefs {
		funcWriter.write("//////////////////////////////////\n// Function: %s\n\n", funct.Name)

		// first let's write out the impl
		implWriter := newGoWriter(p.deps)
		implWriter.write(funct.Source)
		p.gen.Orbiter.PutFile(p.gen.CompilePath+"/go-src/func-"+funct.Name+".go", implWriter.bytes())

		properName := extras.SnakeToCamel(funct.Name) + "Func"

		// Write out a primitive Function impl
		// TODO: make one static instance of this?
		funcWriter.useDep("base")
		funcWriter.write("type %sInner struct {", properName)
		if funct.ContextShape != "" {
			funcWriter.write("\n  ctx *%s\n", extras.SnakeToCamel(funct.ContextShape))
		}
		funcWriter.write("}\n\n")

		funcWriter.write("var _ base.Function = (*%sInner)(nil)\n\n", properName)
		funcWriter.write("func (e *%sInner) Name() string {\n", properName)
		funcWriter.write("  return \"invoke\"\n}\n\n")
		funcWriter.write("func (e *%sInner) Invoke(ctx base.Context, input base.Entry) base.Entry {\n", properName)

		// This call syntax changed based on all three of the shape presences
		funcWriter.write("  ")
		if funct.OutputShape != "" {
			funcWriter.write("return ")
		}
		if funct.ContextShape != "" {
			funcWriter.write("e.ctx.")
		}
		funcWriter.write("%sImpl(", extras.SnakeToCamel(funct.Name))
		if funct.InputShape != "" {
			funcWriter.write("input.(*%s)", extras.SnakeToCamel(funct.InputShape))
		}
		funcWriter.write(")")
		if funct.OutputShape == "" {
			funcWriter.write("\n  return nil")
		}
		funcWriter.write("\n}\n\n")

		// gotta gen a folder impl for every function
		// TODO: if no context, make one static instance of this
		funcWriter.write("type %s struct {", properName)
		if funct.ContextShape != "" {
			funcWriter.write("\n  ctx *%s\n", extras.SnakeToCamel(funct.ContextShape))
		}
		funcWriter.write("}\n\n")

		// Start the struct to be a Folder
		// We want to fit the "Function" shape in core
		funcWriter.useDep("base")
		funcWriter.write("var _ base.Folder = (*%s)(nil)\n\n", properName)
		funcWriter.write("func (e *%s) Name() string {\n", properName)
		funcWriter.write("  return \"%s\"\n}\n\n", funct.Name)

		// List the children
		funcWriter.write("func (e *%s) Children() []string {\n", properName)
		funcWriter.write("  return []string{\n")
		funcWriter.write("    \"invoke\",\n")
		if funct.InputShape != "" {
			funcWriter.write("    \"input-shape\",\n")
		}
		if funct.OutputShape != "" {
			funcWriter.write("    \"output-shape\",\n")
		}
		funcWriter.write("  }\n}\n\n")

		// Enable child fetching
		funcWriter.write("func (e *%s) Fetch(name string) (entry base.Entry, ok bool) {\n", properName)
		funcWriter.write("  switch name {\n\n")

		funcWriter.write("  case \"invoke\":\n")
		funcWriter.write("    return &%sInner{", properName)
		if funct.ContextShape != "" {
			funcWriter.write("e.ctx")
		}
		funcWriter.write("}, true\n")

		// TODO: We don't write out shape _definitions_ yet!
		/*
			funcWriter.write("  case \"input-shape\":\n")
			if funct.InputShape != "" {
				funcWriter.write("    return inmem.NewShape(\"invoke\", %sImpl), true\n", extras.SnakeToCamel(funct.Name))
			}
		*/

		funcWriter.write("  default:\n    return\n  }\n}\n\n")

		// don't allow writing
		funcWriter.write("func (e *%s) Put(name string, entry base.Entry) (ok bool) {\n", properName)
		funcWriter.write("  return false\n}\n\n")
	}
	p.gen.Orbiter.PutFile(p.gen.CompilePath+"/go-src/functions.go", funcWriter.bytes())

	// Create a single main()
	mainWriter := newGoWriter(p.deps)
	mainWriter.useDep("entries")
	mainWriter.useDep("base")
	mainWriter.write("import \"log\"\n\n")

	// Create a blank Stardust
	mainWriter.write("func main() {\n")
	mainWriter.write("  root := entries.NewRootEntry()\n")
	mainWriter.write("  ns := base.NewNamespace(\"/\", root)\n")
	mainWriter.write("  ctx := base.NewRootContext(ns)\n\n")

	// Mount "root" shape at /srv
	mainWriter.write("  ctx.Put(\"/srv\", &Root{})\n\n")
	mainWriter.write("  log.Println(\"Driver subsystem started\")\n")
	mainWriter.write("}")
	p.gen.Orbiter.PutFile(p.gen.CompilePath+"/go-src/main.go", mainWriter.bytes())

	/*
		// Get the Init executable from /rom/bin
		init, ok := ctx.GetFunction("/rom/bin/init/invoke") // TODO
		if !ok {
			panic("Init executable not found. That shouldn't happen.")
		}

		// Get the Consul driver in /rom/drv
		consulClone, ok := ctx.GetFunction("/rom/drv/consul/invoke") // TODO
		if !ok {
			panic("Consul Driver not found. That shouldn't happen.")
		}

		// Mount the Consul driver at /n/consul
		ctx.Put("/n/consul", consulClone.Invoke(ctx, inmem.NewString("uri", *consulUri)))

		// Bind consul keyval tree to /boot/cfg
		kv, ok := ctx.GetFolder("/n/consul/kv")
		if !ok {
			panic("Consul KV not found. That shouldn't happen.")
		}
		ctx.Put("/boot/cfg", kv)

		// Get the init config
		services, ok := ctx.GetFolder("/boot/cfg/services")
		if !ok {
			panic("/boot/cfg/services wasn't a Folder, provide services and try again")
		}

		// Run init
		log.Println("Bootstrapped kernel. Handing control to initsys")
		init.Invoke(ctx, services)
	*/

	return nil
}

// Requires starfs to be mounted at /mnt/stardust
func (p *golang) CompileDriver() error {
	log.Println("Starting compiler")
	os.RemoveAll(p.gen.TargetPath)
	if err := os.Mkdir(p.gen.TargetPath, 0777); err != nil {
		panic("Can't create target path " + p.gen.TargetPath + " on host: " + err.Error())
	}

	workDir := "/mnt/stardust" + p.gen.CompilePath + "/go-src"
	script := "cd " + workDir + "\n\ngo get -d\ngo build -o " + p.gen.TargetPath + "/driver\n"

	cmd := exec.Command("sh", "-ex")
	cmd.Stdin = strings.NewReader(script)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	log.Println("Compiler output:", err, out.String())

	if err == nil {
		cmd = exec.Command(p.gen.TargetPath + "/driver")
		var out2 bytes.Buffer
		cmd.Stdout = &out2
		cmd.Stderr = &out2
		err2 := cmd.Run()
		log.Println("Test run output:", err2, out2.String())
	}

	return nil
}
