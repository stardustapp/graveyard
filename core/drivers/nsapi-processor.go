package drivers

import (
	"log"

	"github.com/stardustapp/core/base"
)

func processNsRequest(root base.Context, req nsRequest) (res nsResponse) {
	switch req.Op {

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

	case "invoke":
		var fun base.Function
		fun, res.Ok = root.GetFunction(req.Path)
		if !res.Ok {
			return
		}

		// TODO: support storing output with 'dest'

		log.Printf("=> invoking %s",  req.Path)
		input := convertEntryFromApi(req.Input)
		output := fun.Invoke(root, input)
		res.Output = convertEntryToApi(output)

	default:
		log.Println("nsexport op", req.Op, "not implemented")
	}
	return
}
