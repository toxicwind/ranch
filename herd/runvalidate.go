// Package main — herd config validation helper.
//
// runValidate loads one config file (or every .yml/.yaml in a directory)
// through config.LoadConfigFromReader and reports the result to out.
// It returns 0 when every config loads and validates, 1 otherwise.
// Exercised by llama-swap_test.go.
package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/mostlygeek/llama-swap/internal/config"
)

func runValidate(configPath, configDir string, out io.Writer) int {
	targets := []string{}
	if configPath != "" {
		targets = append(targets, configPath)
	} else {
		entries, err := os.ReadDir(configDir)
		if err != nil {
			fmt.Fprintf(out, "failed: %v\n", err)
			return 1
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if strings.HasSuffix(name, ".yml") || strings.HasSuffix(name, ".yaml") {
				targets = append(targets, filepath.Join(configDir, name))
			}
		}
	}
	if len(targets) == 0 {
		fmt.Fprintln(out, "failed: no config files found")
		return 1
	}
	failed := false
	for _, t := range targets {
		f, err := os.Open(t)
		if err != nil {
			fmt.Fprintf(out, "failed: %s: %v\n", t, err)
			failed = true
			continue
		}
		_, err = config.LoadConfigFromReader(f)
		f.Close()
		if err != nil {
			fmt.Fprintf(out, "failed: %s: %v\n", t, err)
			failed = true
		}
	}
	if failed {
		return 1
	}
	fmt.Fprintln(out, "config is valid")
	return 0
}
