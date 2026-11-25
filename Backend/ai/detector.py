
import cv2
from ultralytics import YOLO

# Load YOLO model
model = YOLO("Backend/ai/yolo11n.pt")

# Open CCTV footage
video = cv2.VideoCapture("Backend/ai/input.mp4")

if not video.isOpened():
    print("Error: Cannot open video!")
    exit()

# Get video properties
fps = video.get(cv2.CAP_PROP_FPS)
width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))

if fps <= 0:
    fps = 25

# Create output video
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
output = cv2.VideoWriter(
    "Backend/ai/output.mp4",
    fourcc,
    fps,
    (width, height)
)

person_count = 0

print("Starting CCTV AI detection...")

while True:

    ret, frame = video.read()

    if not ret:
        break

    # Detect only people (COCO class 0)
    results = model(
        frame,
        classes=[0],
        conf=0.35,
        verbose=False
    )

    # Draw bounding boxes
    annotated_frame = results[0].plot()

    # Count detected people in current frame
    person_count = len(results[0].boxes)

    # Display detection count
    cv2.putText(
        annotated_frame,
        f"People detected: {person_count}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    # Show video
    cv2.imshow("CCTV AI Detection", annotated_frame)

    # Save processed frame
    output.write(annotated_frame)

    # Press Q to stop
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release resources
video.release()
output.release()
cv2.destroyAllWindows()

print("Detection completed!")
print("Saved as output.mp4")
