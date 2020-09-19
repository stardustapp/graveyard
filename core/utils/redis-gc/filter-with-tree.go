package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

func main() {

	reachableNids := make(map[string]struct{})
	func() {
		f, err := os.Open("root-tree.tsv")
		defer f.Close()
		if err != nil {
			log.Fatal(err)
		}

		rd := bufio.NewReader(f)
		var n int
		log.Println("Reading tree file...")
		stillAlive := true
		for stillAlive {
			line, err := rd.ReadString('\n')
			if err == io.EOF {
				stillAlive = false
			} else if err != nil {
				log.Fatal(err)
			}

			line = strings.TrimSuffix(line, "\n")
			if line == "" {
				break
			}

			parts := strings.Split(line, "\t")
			// parts: depth, nid, name
			reachableNids[parts[1]] = struct{}{}
			n++
		}
		log.Println("Read", len(reachableNids), "unique reachable nids after reading", n, "lines")
	}()

	func() {
		// stream through entry-list, outputing anything not in reachableNids
		f, err := os.Open("entry-list.tsv")
		defer f.Close()
		if err != nil {
			log.Fatal(err)
		}

		rd := bufio.NewReader(f)
		var n int
		var orphans int
		log.Println("Reading entry file...")
		stillAlive := true
		for stillAlive {
			line, err := rd.ReadString('\n')
			if err == io.EOF {
				stillAlive = false
			} else if err != nil {
				log.Fatal(err)
			}

			line = strings.TrimSuffix(line, "\n")
			if line == "" {
				break
			}

			parts := strings.Split(line, "\t")
			// parts: nid, type, name
			if _, ok := reachableNids[parts[0]]; !ok {
				fmt.Println(parts[0])
				orphans++
			}
			n++
		}
		log.Println("Wrote", orphans, "orphans after reading", n, "entries")
	}()

}
