package platforms

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"

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
	p.deps["base"] = "\"github.com/stardustapp/core/base\""
	p.deps["inmem"] = "\"github.com/stardustapp/core/inmem\""
	p.deps["stardust"] = "\"github.com/stardustapp/core/client\""
	p.deps["skylink"] = "\"github.com/stardustapp/core/skylink\""

	depFile, ok := p.gen.DriverCtx.GetFile("/deps.txt")
	if !ok {
		log.Println("No dependency file found in driver")
		return
	}
	deps := depFile.Read(0, int(depFile.GetSize()))

	for _, line := range strings.Split(string(deps), "\n") {
		if strings.HasPrefix(line, "golang ") {
			parts := strings.Split(line, " ")
			p.deps[parts[1]] = parts[2]
		}
	}
}

func (p *golang) GenerateDriver() error {
	log.Println("Generating driver")
	ok := p.gen.CompileCtx.Put("/go-src", inmem.NewFolder("go-src"))
	if !ok {
		panic("Unable to create go-src directory in compile path")
	}

	shapeDefs := p.gen.ListShapes()
	funcDefs := p.gen.ListFunctions()

	shapeNames := make(map[string]stargen.ShapeDef)
	for _, shape := range shapeDefs {
		shapeNames[shape.Name] = shape
	}

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

				// functions have tasty type info
				if prop.Type == "Function" {

					var funct *stargen.FunctionDef
					for _, def := range funcDefs {
						if def.Name == prop.Target {
							funct = &def
							break
						}
					}

					if funct.InputShape != "" {
						shapeWriter.useDep("inmem")
						if funct.InputShape == "String" || funct.InputShape == "Channel" {
							shapeWriter.write("    		inmem.NewShape(inmem.NewFolderOf(\"input-shape\",\n")
							shapeWriter.write("    		  inmem.NewString(\"type\", \"%s\"),\n", funct.InputShape)
							shapeWriter.write("    		)),\n")
						} else {
							shapeWriter.write("				inmem.NewShape(inmem.NewFolderFrom(\"input-shape\", %sShape)),\n",
								extras.SnakeToCamelLower(funct.InputShape))
						}
					}
					if funct.OutputShape != "" {
						shapeWriter.useDep("inmem")
						if funct.OutputShape == "String" || funct.OutputShape == "Channel" {
							shapeWriter.write("   		  inmem.NewShape(inmem.NewFolderOf(\"output-shape\",\n")
							shapeWriter.write("   		    inmem.NewString(\"type\", \"%s\"),\n", funct.OutputShape)
							shapeWriter.write("				)),\n")
						} else {
							shapeWriter.write("				inmem.NewShape(inmem.NewFolderFrom(\"output-shape\", %sShape)),\n",
								extras.SnakeToCamelLower(funct.OutputShape))
						}
					}

				} else {
					if prop.Optional != nil {
						optionalStr := "no"
						if *prop.Optional == true {
							optionalStr = "yes"
						}
						shapeWriter.write("				inmem.NewString(\"optional\", \"%s\"),\n", optionalStr)
					}
				}

				shapeWriter.write("			),\n")
			}
			shapeWriter.write("		),\n")
		}
		shapeWriter.write("	))\n\n")
	}
	p.gen.CompileCtx.Put("/go-src/shapes.go", inmem.NewFile("shapes.go", shapeWriter.bytes()))

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
			} else if _, ok := shapeNames[prop.Type]; ok {
				folderWriter.write("  %s *%s\n", extras.SnakeToCamel(prop.Name), extras.SnakeToCamel(prop.Type))
			} else {
				folderWriter.write("  %s base.%s\n", extras.SnakeToCamel(prop.Name), prop.Type)
				folderWriter.useDep("base")
			}
		}
		for _, prop := range shape.NativeProps {
			folderWriter.write("  %s %s\n", extras.SnakeToCamelLower(prop.Name), prop.Type)
			if strings.Contains(prop.Type, ".") {
				folderWriter.useDep(strings.TrimPrefix(strings.Split(prop.Type, ".")[0], "*"))
			}
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

		// Check if there are fields to pull off a givenfolder
		var needsFolder bool = false
		for _, prop := range shape.Props {
			if prop.Type == "Function" {
				continue
			}
			needsFolder = true
		}

		// Upconvert basic entries into a typed shape
		// TODO: Only works with folders so far
		// Dual-returns with an okay status - checks for required fields and such
		folderWriter.write("func inflate%s(input base.Entry) (out *%s, ok bool) {\n", properName, properName)
		if needsFolder {
			folderWriter.write("  folder, ok := input.(base.Folder)\n")
			folderWriter.write("  if !ok {\n    return nil, false\n  }\n\n")
		}

		folderWriter.write("  x := &%s{}\n\n", properName)
		for _, prop := range shape.Props {
			if prop.Type == "Function" {
				continue // functions are not assigned to instances
			}
			folderWriter.write("  if ent, ok := folder.Fetch(\"%s\"); ok {\n", prop.Name)

			if prop.Type == "String" {
				folderWriter.write("    if stringEnt, ok := ent.(base.String); ok {\n")
				folderWriter.write("      x.%s = stringEnt.Get()\n", extras.SnakeToCamel(prop.Name))
				folderWriter.write("    }\n")
			} else if _, ok := shapeNames[prop.Type]; ok {
				folderWriter.write("    if native, ok := inflate%s(ent); ok {\n", extras.SnakeToCamel(prop.Type))
				folderWriter.write("      x.%s = native\n", extras.SnakeToCamel(prop.Name))
				folderWriter.write("    }\n")
			} else {
				folderWriter.write("    if ent, ok := ent.(base.%s); ok {\n", prop.Type)
				folderWriter.write("      x.%s = ent\n", extras.SnakeToCamel(prop.Name))
				folderWriter.write("    }\n")
				folderWriter.useDep("base")
			}

			folderWriter.write("  }\n\n")
		}
		folderWriter.write("  return x, true\n")
		folderWriter.write("}\n\n")
	}
	p.gen.CompileCtx.Put("/go-src/folders.go", inmem.NewFile("folders.go", folderWriter.bytes()))

	funcWriter := newGoWriter(p.deps)
	for _, funct := range funcDefs {
		funcWriter.write("//////////////////////////////////\n// Function: %s\n\n", funct.Name)

		// first let's write out the impl
		implWriter := newGoWriter(p.deps)
		implWriter.write(funct.Source)
		implFileName := fmt.Sprintf("func-%s.go", funct.Name)
		p.gen.CompileCtx.Put("/go-src/"+implFileName, inmem.NewFile(implFileName, implWriter.bytes()))

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

		// Do some input mapping
		if funct.InputShape == "String" {
			funcWriter.write("  inStr, ok := input.(base.String)\n")
			funcWriter.write("  if !ok {\n    return nil\n  }\n\n")
			funcWriter.write("  realInput := inStr.Get()\n")
		} else if funct.InputShape != "" {
			funcWriter.write("  realInput, ok := inflate%s(input)\n", extras.SnakeToCamel(funct.InputShape))
			funcWriter.write("  if !ok {\n    return nil\n  }\n\n")
		}

		// This call syntax changes based on presence of all three shapes
		funcWriter.write("  ")
		if funct.OutputShape != "" {
			funcWriter.write("result := ")
		}
		if funct.ContextShape != "" {
			funcWriter.write("e.ctx.")
		}
		funcWriter.write("%sImpl(", extras.SnakeToCamel(funct.Name))
		if funct.InputShape != "" {
			funcWriter.write("realInput")
		}
		funcWriter.write(")\n")

		// Map output too if needed
		if funct.OutputShape == "" {
			funcWriter.write("  return nil\n")
		} else if funct.OutputShape == "String" {
			funcWriter.useDep("inmem")
			funcWriter.write("  return inmem.NewString(\"%s-output\", result)\n", funct.Name)
		} else {
			funcWriter.write("  return result\n")
		}
		funcWriter.write("}\n\n")

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

		if funct.ContextShape != "" {
			funcWriter.write("  case \"context-shape\":\n")
			funcWriter.write("    return %sShape, true\n", extras.SnakeToCamelLower(funct.ContextShape))
		}
		if funct.InputShape != "" {
			funcWriter.write("  case \"input-shape\":\n")
			if funct.InputShape == "String" || funct.InputShape == "Channel" {
				funcWriter.useDep("inmem")
				funcWriter.write("    return inmem.NewShape(inmem.NewFolderOf(\"input-shape\",\n")
				funcWriter.write("      inmem.NewString(\"type\", \"%s\"),\n", funct.InputShape)
				funcWriter.write("    )), true\n")
			} else {
				funcWriter.write("    return %sShape, true\n", extras.SnakeToCamelLower(funct.InputShape))
			}
		}
		if funct.OutputShape != "" {
			funcWriter.write("  case \"output-shape\":\n")
			if funct.OutputShape == "String" || funct.OutputShape == "Channel" {
				funcWriter.useDep("inmem")
				funcWriter.write("    return inmem.NewShape(inmem.NewFolderOf(\"output-shape\",\n")
				funcWriter.write("      inmem.NewString(\"type\", \"%s\"),\n", funct.OutputShape)
				funcWriter.write("    )), true\n")
			} else {
				funcWriter.write("    return %sShape, true\n", extras.SnakeToCamelLower(funct.OutputShape))
			}
		}

		funcWriter.write("  default:\n    return\n  }\n}\n\n")

		// don't allow writing
		funcWriter.write("func (e *%s) Put(name string, entry base.Entry) (ok bool) {\n", properName)
		funcWriter.write("  return false\n}\n\n")
	}
	p.gen.CompileCtx.Put("/go-src/functions.go", inmem.NewFile("functions.go", funcWriter.bytes()))

	// Create a single main()
	mainWriter := newGoWriter(p.deps)
	mainWriter.useDep("skylink")
	mainWriter.useDep("inmem")
	mainWriter.useDep("base")
	mainWriter.write("import \"log\"\n")
	mainWriter.write("import \"fmt\"\n")
	mainWriter.write("import \"net/http\"\n\n")

	// Create a blank Stardust
	mainWriter.write("func main() {\n")
	mainWriter.write("  root := inmem.NewFolderOf(\"/\",\n")
	mainWriter.write("	  inmem.NewFolder(\"n\"),\n")
	mainWriter.write("	  inmem.NewFolder(\"tmp\"),\n")
	mainWriter.write("	  inmem.NewFolderOf(\"drivers\",\n")
	mainWriter.write("	    skylink.GetNsexportDriver(),\n")
	mainWriter.write("    ),\n")
	mainWriter.write("  )\n\n")
	mainWriter.write("  ns := base.NewNamespace(\"/\", root)\n")
	mainWriter.write("  ctx := base.NewRootContext(ns)\n\n")

	// Mount "root" shape at /srv
	mainWriter.write("  ctx.Put(\"/srv\", &Root{})\n\n")

	mainWriter.write("  log.Println(\"Starting nsexport...\")\n")
	mainWriter.write("  exportFunc, _ := ctx.GetFunction(\"/drivers/nsexport/invoke\")\n")
	mainWriter.write("  exportBase, _ := ctx.Get(\"/srv\")\n")
	mainWriter.write("  exportFunc.Invoke(ctx, exportBase)\n\n")

	mainWriter.write("  host := fmt.Sprint(\"0.0.0.0:\", 9234)\n")
	mainWriter.write("  log.Printf(\"Listening on %%s...\", host)\n")
	mainWriter.write("  if err := http.ListenAndServe(host, nil); err != nil {\n")
	mainWriter.write("    log.Println(\"ListenAndServe:\", err)\n")
	mainWriter.write("  }\n")

	mainWriter.write("}\n")
	p.gen.CompileCtx.Put("/go-src/main.go", inmem.NewFile("main.go", mainWriter.bytes()))

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
	script := "cd " + workDir + "\n\ntime go get -d\ntime go build -o " + p.gen.TargetPath + "/driver\n"

	cmd := exec.Command("sh", "-ex")
	cmd.Stdin = strings.NewReader(script)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	log.Println("Compiler output:", err, out.String())

	// TODO: verify the endpoint is available, then shut down the test
	/*
		if err == nil {
			cmd = exec.Command(p.gen.TargetPath + "/driver")
			var out2 bytes.Buffer
			cmd.Stdout = &out2
			cmd.Stderr = &out2
			err2 := cmd.Run()
			log.Println("Test run output:", err2, out2.String())
		}
	*/

	return nil
}
