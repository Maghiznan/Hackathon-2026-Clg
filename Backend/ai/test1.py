
import cv2
from ultralytics import YOLO

# Load YOLO model
model = YOLO("Backend/ai/yolo11n.pt")

# Open CCTV footage
video = cv2.VideoCapture("Backend/ai/input.mp4")

if not video.isOpened():
    print("Cannot open video!")
    exit()

width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = video.get(cv2.CAP_PROP_FPS)

if fps <= 0:
    fps = 25

# Virtual boundary position
BOUNDARY_Y = height // 2

# Output video
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
output = cv2.VideoWriter(
    "Backend/ai/output.mp4", fourcc, fps, (width, height)
)

print("Border surveillance started...")

while True:

    ret, frame = video.read()

    if not ret:
        break

    results = model(
        frame,
        classes=[0],
        conf=0.35,
        verbose=False
    )

    people_inside = 0

    # Draw virtual boundary
    cv2.line(
        frame,
        (0, BOUNDARY_Y),
        (width, BOUNDARY_Y),
        (0, 0, 255),
        3
    )

    for box in results[0].boxes:

        x1, y1, x2, y2 = map(
            int, box.xyxy[0].tolist()
        )

        # Bottom-center of person
        center_x = (x1 + x2) // 2
        foot_y = y2

        # Check boundary
        if foot_y > BOUNDARY_Y:
            color = (0, 0, 255)  # Red
            status = "RESTRICTED ZONE"
            people_inside += 1
        else:
            color = (0, 255, 0)  # Green
            status = "SAFE ZONE"

        # Bounding box
        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2
        )

        # Display status
        cv2.putText(
            frame,
            status,
            (x1, max(y1 - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2
        )

    # Dashboard information
    cv2.putText(
        frame,
        f"People in restricted zone: {people_inside}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 0, 255),
        2
    )

    cv2.imshow("AI Border Surveillance", frame)

    output.write(frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

video.release()
output.release()
cv2.destroyAllWindows()

print("Surveillance processing completed!")
