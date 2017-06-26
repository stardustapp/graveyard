package skylink

import (
	"log"

	"github.com/stardustapp/core/base"
)

func processNsRequest(root base.Context, req nsRequest) (res nsResponse) {
	switch req.Op {

	case "ping":
		res.Ok = true

	case "get":
		var ent base.Entry
		ent, res.Ok = root.Get(req.Path)
		//log.Println("nsexport: get on", req.Path, "was", res.Ok)
		if !res.Ok {
			return
		}
		if ent == nil {
			//log.Println("nsexport: get on", req.Path, "was nil")
			res.Ok = false
			return
		}

		wireEnt := &nsEntry{
			Name: ent.Name(),
		}
		switch ent := ent.(type) {

		// Shapes are special folders (ugh) so match them first
		case base.Shape:
			names := ent.Children()
			children := make([]nsEntry, len(names))
			for idx, name := range names {
				children[idx] = nsEntry{
					Name: name,
				}
			}
			wireEnt.Type = "Shape"
			wireEnt.Children = children

		case base.Folder:
			names := ent.Children()
			children := make([]nsEntry, len(names))
			for idx, name := range names {
				children[idx] = nsEntry{
					Name: name,
				}
			}
			wireEnt.Type = "Folder"
			wireEnt.Children = children

		case base.File:
			wireEnt.Type = "File"
			wireEnt.FileData = ent.Read(0, int(ent.GetSize()))

		case base.String:
			wireEnt.Type = "String"
			wireEnt.StringValue = ent.Get()

		case base.Function:
			wireEnt.Type = "Function"

		default:
			wireEnt.Type = "Unknown"
		}
		res.Output = wireEnt

	case "enumerate":
		var ent base.Entry
		ent, res.Ok = root.Get(req.Path)
		if !res.Ok {
			log.Println("nsapi: can't find", req.Path, "to start enumeration at")
			return
		}

		listEnt := &nsEntry{
			Name: "enumeration",
			Type: "Folder",
		}

		enum := NewEnumerator(root, ent, req.Depth)
		for _, path := range req.Shapes {
			enum.AddShapeByPath(path)
		}

		results := enum.Run()
		for listing := range results {
			listEnt.Children = append(listEnt.Children, listing)
		}

		res.Ok = enum.IsOk()
		res.Output = listEnt

	case "invoke":
		var fun base.Function
		fun, res.Ok = root.GetFunction(req.Path)
		if !res.Ok {
			return
		}

		log.Println("=> invoking", req.Path)
		input := convertEntryFromApi(req.Input)
		output := fun.Invoke(root, input)

		if req.Dest != "" {
			res.Ok = root.Put(req.Dest, output)
			if !res.Ok {
				log.Println("nsapi: failed to store output at", req.Dest)
			}
		} else {
			res.Output = convertEntryToApi(output)
		}

	case "store":
		entry := convertEntryFromApi(req.Input)
		if entry == nil {
			// block deleting via store
			log.Println("=> blocking nil store to", req.Dest)
			return
		}

		log.Println("=> storing to", req.Dest)
		res.Ok = root.Put(req.Dest, entry)

	case "copy":
		var src base.Entry
		src, res.Ok = root.Get(req.Path)
		if !res.Ok {
			return
		}

		log.Println("=> copying", req.Path, "to", req.Dest)
		res.Ok = root.Put(req.Dest, src)

	case "unlink":
		log.Println("=> unlinking", req.Path)
		res.Ok = root.Put(req.Path, nil)

	default:
		log.Println("nsexport op", req.Op, "not implemented")
	}
	return
}
