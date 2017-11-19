package skylink

import (
	"log"
	"time"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
)

func processNsRequest(root base.Context, req nsRequest) (res nsResponse) {
	start := time.Now()
	switch req.Op {

	case "ping":
		res.Ok = true

	case "get":
		var ent base.Entry
		ent, res.Ok = root.Get(req.Path)
		//log.Println("nsexport: get on", req.Path, "was", res.Ok)
		if !res.Ok {
			break
		}
		if ent == nil {
			//log.Println("nsexport: get on", req.Path, "was nil")
			res.Ok = false
			break
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

		case base.Link:
			wireEnt.Type = "Link"
			wireEnt.StringValue = ent.Target()

		case base.Function:
			wireEnt.Type = "Function"

		case base.Channel:
			wireEnt.Type = "Channel"

		default:
			wireEnt.Type = "Unknown"
		}
		res.Output = wireEnt

	case "enumerate":
		var ent base.Entry
		ent, res.Ok = root.Get(req.Path)
		if !res.Ok {
			log.Println("nsapi: can't find", req.Path, "to start enumeration at")
			break
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

	case "subscribe":
		var ent base.Entry
		ent, res.Ok = root.Get(req.Path)
		if !res.Ok {
			log.Println("nsapi: can't find", req.Path, "to start subscription at")
			break
		}

		sub := NewSubscription(ent, req.Depth)
		if err := sub.Run(); err != nil {
			log.Println("nsapi: refusing subscribe on", req.Path)
			res.Ok = false
			res.Output = &nsEntry{
				Name:        "nosub",
				Type:        "String",
				StringValue: err.Error(),
			}
			break
		}

		respC := make(chan nsResponse)
		res.Ok = true
		res.Channel = respC
		res.StopC = sub.StopC

		go func(inC <-chan Notification, outC chan<- nsResponse) {
			log.Println("starting notif pump")
			defer log.Println("stopped notif pump")

			for next := range inC {
				//log.Printf("pumping %+v", next.Entry)
				children := []nsEntry{{
					Name:        "type",
					Type:        "String",
					StringValue: next.Type,
				}, {
					Name:        "path",
					Type:        "String",
					StringValue: next.Path,
				}}

				pktEntry := convertEntryToApi(next.Entry)
				if pktEntry != nil {
					pktEntry.Name = "entry"
					children = append(children, *pktEntry)
				}

				// TODO: make errors into errors?
				outC <- nsResponse{
					Status: "Next",
					Output: &nsEntry{
						Name:     "notif",
						Type:     "Folder",
						Children: children,
					},
				}
			}

			log.Println("stopping notif pump")
			close(outC)
		}(sub.streamC, respC)

	case "invoke":
		var fun base.Function
		fun, res.Ok = root.GetFunction(req.Path)
		if !res.Ok {
			break
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
			break
		}

		log.Println("=> storing to", req.Dest, entry)
		res.Ok = root.Put(req.Dest, entry)

	case "copy":
		var src base.Entry
		src, res.Ok = root.Get(req.Path)
		if !res.Ok {
			break
		}

		log.Println("=> copying", req.Path, "to", req.Dest)
		res.Ok = root.Put(req.Dest, src)

	case "unlink":
		log.Println("=> unlinking", req.Path)
		res.Ok = root.Put(req.Path, nil)

	case "chan/next", "chan/try-next":
		var channel base.Channel
		channel, res.Ok = root.GetChannel(req.Path)
		if !res.Ok {
			break
		}

		log.Println("=> reading from channel", req.Path)
		var value base.Entry

		switch req.Op {
		case "chan/next":
			value, res.Ok = channel.Next()
		case "chan/try-next":
			value, res.Ok = channel.TryNext()
		}
		if !res.Ok {
			break
		}

		if req.Dest != "" {
			res.Ok = root.Put(req.Dest, value)
			if !res.Ok {
				log.Println("nsapi: failed to store output at", req.Dest)
			}
		} else {
			res.Output = convertEntryToApi(value)
		}

	case "chan/push":
		var channel base.Channel
		channel, res.Ok = root.GetChannel(req.Dest)
		if !res.Ok {
			break
		}

		var entry base.Entry
		if req.Path != "" {
			entry, res.Ok = root.Get(req.Path)
			if !res.Ok {
				break
			}
		} else {
			entry = convertEntryFromApi(req.Input)
		}

		if entry == nil {
			// block deleting via store
			log.Println("=> blocking nil write to", req.Dest)
			break
		}

		log.Println("=> writing to channel", req.Dest)
		res.Ok = channel.Push(entry)

	case "chan/close":
		var channel base.Channel
		channel, res.Ok = root.GetChannel(req.Path)
		if !res.Ok {
			break
		}

		log.Println("=> closing channel", req.Path)
		channel.Close()
		res.Ok = true

	default:
		log.Println("nsexport op", req.Op, "not implemented")
	}

	// report operation metrics
	okTag := "ok:false"
	if res.Ok {
		okTag = "ok:true"
	}
	elapsedMs := float64(time.Since(start) / time.Millisecond)
	extras.MetricIncr("skylink.op.invocation", "op:"+req.Op, okTag)
	extras.MetricGauge("skylink.op.elapsed_ms", elapsedMs, "op:"+req.Op, okTag)

	return
}
