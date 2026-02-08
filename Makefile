run:
	node index.js

clear:
	@echo "🧹 Cleaning generated files..."
	@rm -f result/audio/*.mp3
	@rm -f result/shadowing/*.mp3
	@rm -f result/text/*.txt
	@rm -f output_dictation.mp3 transcript.txt
	@rm -rf temp_segments/
	@echo "✅ All generated files removed!"
