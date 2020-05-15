package ircClient

import (
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/skylink"
	//"github.com/stardustapp/core/inmem"
)

// starting from optional given message ID (else horizon),
// send all new messages in order to the output channel
// path e.g. "/persist/irc/networks/freenode/channels/#dagd/log"
func (s *Session) SubscribeToLog(path string, startingAfter string) (*Subscription, error) {

	latestPartC, partStopC, err := s.subscribeSingleToChannel(path + "/latest")
	if err != nil {
		return nil, err
	}

	sub := &Subscription{
		rootPath: path,
		session:  s,
		C:        make(chan Packet),
		StopC:    partStopC,
	}

	go sub.processParts(latestPartC)
	return sub, nil
}

type Subscription struct {
	rootPath string
	session  *Session

	partC  chan string // if this is readable, there's another part to read
	eventC chan string // if this is readable, there's another event to read
	C      chan Packet // the actual packet stream for outsiders

	StopC chan<- struct{}
}

func (s *Subscription) processParts(nextPartC <-chan string) {
	log.Println("Waiting for a part...")
	nextPart := <-nextPartC
	partC := nextPartC
	isFirstPart := true

	for nextPart != "" {
		//partC = nextPartC // enable finding a new part
		pktIdx := -1
		partId := nextPart
		log.Println("Starting part", partId)

		latestPktC, pktStopC, err := s.session.subscribeSingleToChannel(s.rootPath + "/" + partId + "/latest")
		if err != nil {
			panic(err)
		}

		// the initial partition won't be read in full
		if isFirstPart {
			i, _ := strconv.Atoi(<-latestPktC)
			pktIdx = i
			isFirstPart = false
		}

		for latestPktC != nil {
			select {
			case packetId, ok := <-latestPktC:
				if ok {
					i, _ := strconv.Atoi(packetId)
					for pktIdx < i {
						pktIdx++
						pktIdxStr := strconv.Itoa(pktIdx)
						pkt, err := loadPacket(s.session.ctx, s.rootPath+"/"+partId+"/"+pktIdxStr)
						if err == nil {
							s.C <- pkt
						} else {
							panic(err)
						}
					}

				} else {
					latestPktC = nil
				}

			case newPart, ok := <-partC:
				if ok {
					nextPart = newPart
				} else {
					nextPart = ""
				}

				log.Println("Heard of new part", nextPart, "- shutting down current")
				close(pktStopC)
				partC = nil
			}
		}
	}

	// no more parts, finish out
	log.Println("processParts ran out of parts")
	close(s.C)
}

func (s *Session) subscribeSingleToChannel(path string) (outC <-chan string, stopC chan<- struct{}, err error) {
	stringEnt, ok := s.ctx.GetString(path)
	if !ok {
		return nil, nil, errors.New("Couldn't find latest partition of log " + path)
	}

	stringSub := skylink.NewSubscription(stringEnt, 0)
	if err := stringSub.Run(); err != nil {
		return nil, nil, err
	}

	respC := make(chan string)
	go func(inC <-chan skylink.Notification, outC chan<- string) {
		for next := range inC {
			if next.Type == "Added" || next.Type == "Changed" {
				if strEnt, ok := next.Entry.(base.String); ok {
					outC <- strEnt.Get()
				} else {
					log.Printf("WARN: dropping stringsub event %v - wasn't string: %+v", next, next.Entry)
				}
			} else if next.Type == "Removed" {
				outC <- ""
			}
		}
		close(outC)
	}(stringSub.StreamC, respC)

	return respC, stringSub.StopC, nil
}

func loadPacket(ctx base.Context, path string) (Packet, error) {
	rootEnt, ok := ctx.GetFolder(path)
	if !ok {
		return Packet{}, errors.New("Couldn't find message at " + path)
	}

	var pkt Packet

	enum := skylink.NewEnumerator(ctx, rootEnt, 2)
	entryC := enum.Run()
	for entry := range entryC {
		if entry.Name == "command" {
			pkt.Command = entry.StringValue
		} else if entry.Name == "prefix-host" {
			pkt.PrefixHost = entry.StringValue
		} else if entry.Name == "prefix-name" {
			pkt.PrefixName = entry.StringValue
		} else if entry.Name == "prefix-user" {
			pkt.PrefixUser = entry.StringValue
		} else if entry.Name == "source" {
			pkt.Source = entry.StringValue
		} else if entry.Name == "timestamp" {
			if date, err := time.Parse(time.RFC3339Nano, entry.StringValue); err == nil {
				pkt.Timestamp = date
			}
		} else if strings.HasPrefix(entry.Name, "params/") {
			//i, _ := strconv.Atoi(strings.Split(entry.Name, "/")[1])
			// TODO: keep ordering
			pkt.Params = append(pkt.Params, entry.StringValue)
		} // TODO: tags
	}

	return pkt, nil
}
