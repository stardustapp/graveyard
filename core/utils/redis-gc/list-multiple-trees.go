package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)
import "github.com/go-redis/redis"

func main() {
	client := redis.NewClient(&redis.Options{
		Addr:     "apt:31500",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	var printTree func(rootNid string, prefix string)
	printTree = func(rootNid string, prefix string) {
		subPrefix := prefix + "\t"

		resp := client.HGetAll("sdns:nodes/" + rootNid + ":children")
		for name, childNid := range resp.Val() {
			fmt.Printf("%s%s\t%s\n", prefix, childNid, name)
			printTree(childNid, subPrefix)
		}
	}

	f, err := os.Open("native-drivers.txt")
	defer f.Close()
	if err != nil {
		log.Fatal(err)
	}

	rd := bufio.NewReader(f)
	stillAlive := true
	for stillAlive {
		line, err := rd.ReadString('\n')
		if err == io.EOF {
			stillAlive = false
		} else if err != nil {
			log.Fatal(err)
		}

		nid := strings.TrimSuffix(line, "\n")
		fmt.Printf("%s\n", nid)
		printTree(nid, "\t")
		fmt.Printf("\n")
	}
}
